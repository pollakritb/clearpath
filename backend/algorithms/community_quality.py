"""Pure rules for privacy, corroboration and community gap-fill eligibility."""

from __future__ import annotations

import hashlib
import math
from collections.abc import Sequence
from datetime import UTC, datetime

from .distance import haversine_km


def _as_datetime(value: str) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)
    except (TypeError, ValueError):
        return None


def obfuscate_coordinates(
    lat: float,
    lon: float,
    *,
    secret_seed: str,
    min_meters: float = 120.0,
    max_meters: float = 250.0,
) -> tuple[float, float, int]:
    """Apply a stable secret-seeded offset before exposing a home-like GPS point."""
    digest = hashlib.sha256(secret_seed.encode("utf-8")).digest()
    angle = int.from_bytes(digest[:4], "big") / (2**32) * 2.0 * math.pi
    fraction = int.from_bytes(digest[4:8], "big") / (2**32)
    radius = min_meters + (max_meters - min_meters) * fraction
    north = math.sin(angle) * radius
    east = math.cos(angle) * radius
    lat_delta = north / 111_320.0
    lon_scale = max(0.2, math.cos(math.radians(lat)))
    lon_delta = east / (111_320.0 * lon_scale)
    return round(lat + lat_delta, 6), round(lon + lon_delta, 6), round(radius)


def pm25_values_compatible(a: float, b: float) -> bool:
    """Allow normal low-cost sensor variation without treating unrelated values as support."""
    tolerance = max(10.0, max(abs(a), abs(b)) * 0.25)
    return abs(a - b) <= tolerance


def corroboration_count(
    target: dict,
    approved_reports: Sequence[dict],
    *,
    radius_km: float = 2.0,
    window_minutes: float = 60.0,
) -> int:
    """Count independent reporters with nearby, contemporaneous, compatible readings."""
    target_time = _as_datetime(str(target.get("captured_at") or ""))
    target_pm25 = target.get("pm25")
    if target_time is None or target_pm25 is None:
        return 0
    users: set[str] = set()
    target_id = str(target.get("id") or "")
    for candidate in approved_reports:
        if candidate.get("status") != "approved" or candidate.get("pm25") is None:
            continue
        candidate_time = _as_datetime(str(candidate.get("captured_at") or ""))
        if candidate_time is None:
            continue
        age_delta = abs((candidate_time - target_time).total_seconds()) / 60.0
        if age_delta > window_minutes:
            continue
        distance = haversine_km(
            float(target["lat"]),
            float(target["lon"]),
            float(candidate["lat"]),
            float(candidate["lon"]),
        )
        if distance > radius_km:
            continue
        if not pm25_values_compatible(float(target_pm25), float(candidate["pm25"])):
            continue
        candidate_user = str(candidate.get("user_id") or "")
        if candidate_user:
            users.add(candidate_user)
    # Ensure the current report counts even if callers passed a list without it.
    target_user = str(target.get("user_id") or target_id)
    if target_user:
        users.add(target_user)
    return len(users)


def evaluate_gap_fill(
    *,
    admin_verified: bool,
    report_fresh: bool,
    data_role: str,
    trust_score: float,
    corroborated_reporters: int,
    device_calibrated: bool,
    near_emission_source: bool,
    gps_accuracy_m: float | None,
    duplicate_detected: bool = False,
) -> dict:
    """Separate point publication from permission to influence the IDW surface."""
    if not admin_verified:
        return {"eligible": False, "basis": "none", "reason": "รอ Admin อนุมัติ"}
    if not report_fresh:
        return {"eligible": False, "basis": "none", "reason": "ข้อมูลหมดอายุ"}
    if duplicate_detected:
        return {
            "eligible": False,
            "basis": "none",
            "reason": "ภาพคล้ายรายงานเดิม ไม่ใช้เติมพื้นผิว",
        }
    if data_role != "gap_fill":
        return {
            "eligible": False,
            "basis": "none",
            "reason": "มี Air4Thai สดภายใน 5 กม.",
        }
    if trust_score < 60:
        return {"eligible": False, "basis": "none", "reason": "Trust Score ต่ำกว่า 60"}
    if near_emission_source:
        return {"eligible": False, "basis": "none", "reason": "จุดวัดอยู่ติดแหล่งควันโดยตรง"}
    if gps_accuracy_m is not None and gps_accuracy_m > 200:
        return {
            "eligible": False,
            "basis": "none",
            "reason": "ความแม่นยำ GPS เกิน 200 เมตร",
        }
    if corroborated_reporters >= 2:
        return {
            "eligible": True,
            "basis": "corroborated",
            "reason": f"มีผู้รายงานอิสระ {corroborated_reporters} คนใน 2 กม./1 ชม.",
        }
    if trust_score >= 80 and device_calibrated:
        return {
            "eligible": True,
            "basis": "calibrated_high_trust",
            "reason": "Trust ≥80 และเครื่องวัดมีข้อมูลสอบเทียบ",
        }
    return {
        "eligible": False,
        "basis": "none",
        "reason": "ต้องมี 2 ผู้รายงานที่ค่าใกล้กัน หรือ Trust ≥80 พร้อมเครื่องสอบเทียบ",
    }


def _report_weight(report: dict, *, now: datetime) -> float:
    """Quality weight for a community reading; all factors are intentionally bounded."""
    trust = max(0.0, min(100.0, float(report.get("trust_score") or 0.0))) / 100.0
    captured = _as_datetime(str(report.get("captured_at") or ""))
    if captured is None:
        return 0.0
    age_minutes = max(0.0, (now - captured).total_seconds() / 60.0)
    if age_minutes > 180.0:
        return 0.0
    freshness = 1.0 - (0.5 * age_minutes / 180.0)
    calibration = 1.2 if report.get("device_calibrated") else 1.0
    accuracy = report.get("gps_accuracy_m")
    gps = (
        1.0
        if accuracy is None or float(accuracy) <= 50
        else 0.9
        if float(accuracy) <= 100
        else 0.75
    )
    return trust * freshness * calibration * gps


def _weighted_median(values: list[tuple[float, float]]) -> float:
    ordered = sorted(values, key=lambda item: item[0])
    total = sum(weight for _value, weight in ordered)
    threshold = total / 2.0
    cumulative = 0.0
    for value, weight in ordered:
        cumulative += weight
        if cumulative >= threshold:
            return value
    return ordered[-1][0]


def aggregate_community_reports(
    reports: Sequence[dict], *, now: datetime | None = None
) -> list[dict]:
    """Cluster compatible readings and return robust weighted-median map points."""
    checked_at = now or datetime.now(UTC)
    candidates = [
        dict(report)
        for report in reports
        if report.get("status") == "approved"
        and report.get("pm25") is not None
        and report.get("eligible_for_gap_fill", True)
        and _report_weight(report, now=checked_at) > 0
    ]
    parents = list(range(len(candidates)))

    def find(index: int) -> int:
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    def union(left: int, right: int) -> None:
        a, b = find(left), find(right)
        if a != b:
            parents[b] = a

    for left in range(len(candidates)):
        left_time = _as_datetime(str(candidates[left].get("captured_at") or ""))
        for right in range(left + 1, len(candidates)):
            right_time = _as_datetime(str(candidates[right].get("captured_at") or ""))
            if left_time is None or right_time is None:
                continue
            if abs((left_time - right_time).total_seconds()) > 3600:
                continue
            if (
                haversine_km(
                    float(candidates[left]["lat"]),
                    float(candidates[left]["lon"]),
                    float(candidates[right]["lat"]),
                    float(candidates[right]["lon"]),
                )
                > 2.0
            ):
                continue
            if pm25_values_compatible(
                float(candidates[left]["pm25"]), float(candidates[right]["pm25"])
            ):
                union(left, right)

    groups: dict[int, list[dict]] = {}
    for index, report in enumerate(candidates):
        groups.setdefault(find(index), []).append(report)

    result: list[dict] = []
    for members in groups.values():
        independent_users = {str(member.get("user_id")) for member in members}
        single_allowed = (
            len(members) == 1
            and float(members[0].get("trust_score") or 0) >= 80
            and bool(members[0].get("device_calibrated"))
        )
        if len(independent_users) < 2 and not single_allowed:
            continue
        weighted = [
            (member, _report_weight(member, now=checked_at)) for member in members
        ]
        total_weight = sum(weight for _member, weight in weighted)
        result.append(
            {
                "id": "community-cluster:"
                + ":".join(sorted(str(m["id"]) for m in members)),
                "lat": sum(float(m["lat"]) * w for m, w in weighted) / total_weight,
                "lon": sum(float(m["lon"]) * w for m, w in weighted) / total_weight,
                "pm25": _weighted_median([(float(m["pm25"]), w) for m, w in weighted]),
                "report_count": len(members),
                "reporter_count": len(independent_users),
                "source": "community",
                "averaging_period": "instant",
                "report_ids": [str(m["id"]) for m in members],
            }
        )
    return result
