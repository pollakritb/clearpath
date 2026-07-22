"""Explainable Trust Score for community PM2.5 reports (pure, no I/O)."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime

from .area import is_nakhon_pathom
from .distance import haversine_km


def is_nakhon_pathom_area(lat: float, lon: float) -> bool:
    """Backward-compatible public name for province eligibility checks."""
    return is_nakhon_pathom(lat, lon)


def capture_age_minutes(captured_at: str, now: datetime | None = None) -> float | None:
    try:
        captured = datetime.fromisoformat(captured_at.replace("Z", "+00:00"))
        if captured.tzinfo is None:
            captured = captured.replace(tzinfo=UTC)
    except (AttributeError, TypeError, ValueError):
        return None
    checked_at = now or datetime.now(UTC)
    return max(0.0, (checked_at - captured).total_seconds() / 60.0)


def is_report_fresh(
    captured_at: str, *, max_age_minutes: float = 180, now: datetime | None = None
) -> bool:
    age = capture_age_minutes(captured_at, now)
    return age is not None and age <= max_age_minutes


def _freshness_score(captured_at: str, now: datetime | None = None) -> float:
    age_min = capture_age_minutes(captured_at, now)
    if age_min is None or age_min >= 120:
        return 0.0
    if age_min <= 10:
        return 10.0
    return 10.0 * (120.0 - age_min) / 110.0


def nearest_official_station(
    lat: float,
    lon: float,
    official_stations: Sequence[dict],
    *,
    max_age_minutes: float | None = None,
    now: datetime | None = None,
) -> tuple[dict | None, float | None]:
    usable = [s for s in official_stations if s.get("pm25") is not None]
    if max_age_minutes is not None:
        checked_at = now or datetime.now(UTC)
        fresh: list[dict] = []
        for station in usable:
            recorded_at = station.get("recorded_at")
            try:
                recorded = datetime.fromisoformat(
                    str(recorded_at).replace("Z", "+00:00")
                )
                if recorded.tzinfo is None:
                    recorded = recorded.replace(tzinfo=UTC)
            except (TypeError, ValueError):
                continue
            if 0 <= (checked_at - recorded).total_seconds() / 60.0 <= max_age_minutes:
                fresh.append(station)
        usable = fresh
    if not usable:
        return None, None
    nearest = min(
        usable, key=lambda s: haversine_km(lat, lon, float(s["lat"]), float(s["lon"]))
    )
    return nearest, haversine_km(lat, lon, float(nearest["lat"]), float(nearest["lon"]))


def calculate_trust_score(
    *,
    lat: float,
    lon: float,
    pm25: float | None,
    captured_at: str,
    capture_source: str,
    ocr_pm25: float | None,
    ocr_confidence: float,
    device_detected: bool,
    display_clear: bool,
    official_stations: Sequence[dict],
    reporter_reputation: int = 0,
    admin_verified: bool = False,
    capture_verified: bool = False,
    measurement_environment: str = "outdoor",
    measurement_stable: bool = True,
    near_emission_source: bool = False,
    gps_accuracy_m: float | None = None,
    duplicate_detected: bool = False,
) -> dict:
    """Return score 0..100 and human-readable reasons.

    Admin verification is the decisive evidence in MVP. OCR is advisory and is
    deliberately not allowed to publish or approve a report by itself.
    """
    score = 0.0
    reasons: list[str] = []

    if admin_verified:
        score += 25.0
        reasons.append("ผู้ดูแลอ่านค่าและยืนยันจากภาพแล้ว")
    else:
        reasons.append("รอผู้ดูแลอ่านค่า PM2.5 จากภาพ")

    if capture_source == "camera" and capture_verified:
        score += 15.0
        reasons.append("ใช้ camera session ที่ระบบออกให้")
    else:
        reasons.append("ไม่ผ่านหลักฐาน camera session")

    fresh = _freshness_score(captured_at)
    score += fresh
    reasons.append(
        "ส่งภาพภายในช่วงเวลาที่กำหนด" if fresh >= 8 else "เวลาถ่ายภาพห่างจากเวลาส่ง"
    )

    if is_nakhon_pathom_area(lat, lon):
        score += 10.0
        reasons.append("GPS อยู่ในพื้นที่นครปฐม")
    else:
        reasons.append("GPS อยู่นอกพื้นที่ให้บริการนครปฐม")

    if (
        measurement_environment == "outdoor"
        and measurement_stable
        and not near_emission_source
    ):
        score += 10.0
        reasons.append("ยืนยันว่าวัดกลางแจ้งและรอค่าคงที่")
    else:
        reasons.append("วิธีวัดไม่ผ่านเกณฑ์กลางแจ้ง/ค่าคงที่/ห่างแหล่งควัน")

    if gps_accuracy_m is not None:
        reasons.append(f"ความแม่นยำ GPS ประมาณ {gps_accuracy_m:.0f} เมตร")
        if gps_accuracy_m > 200:
            score = max(0.0, score - 10.0)

    if device_detected and display_clear:
        score += 5.0
        reasons.append("ระบบช่วยตรวจพบหน้าจอเครื่องวัดชัดเจน")
    elif ocr_confidence > 0:
        reasons.append(f"OCR มั่นใจ {round(ocr_confidence * 100)}% แต่ยังต้องตรวจด้วยคน")
    else:
        reasons.append("OCR ไม่พร้อม ใช้การตรวจด้วยผู้ดูแล")

    nearest, distance = nearest_official_station(
        lat, lon, official_stations, max_age_minutes=90
    )
    if nearest is None or distance is None:
        score += 7.5
        reasons.append("ไม่มีข้อมูลสถานีทางการสำหรับเปรียบเทียบ จึงให้คะแนนกลาง")
    elif distance > 5.0:
        score += 7.5
        reasons.append(f"ไม่มีสถานี Air4Thai ภายใน 5 กม. (ใกล้สุด {distance:.1f} กม.)")
    elif pm25 is None:
        reasons.append(f"มี Air4Thai ใกล้ {distance:.1f} กม. รอค่า Admin เพื่อเปรียบเทียบ")
    else:
        official_pm25 = float(nearest["pm25"])
        diff = abs(pm25 - official_pm25)
        allowed = max(10.0, official_pm25 * 0.5)
        official_points = max(0.0, 15.0 * (1.0 - diff / max(allowed, 1.0)))
        score += official_points
        reasons.append(
            f"Air4Thai ใกล้สุด {distance:.1f} กม. ค่า {official_pm25:.1f}; ต่าง {diff:.1f} µg/m³"
        )

    reputation_points = max(0.0, min(10.0, reporter_reputation / 10.0))
    score += reputation_points
    if reputation_points:
        reasons.append("มีประวัติผู้รายงานที่น่าเชื่อถือ")

    if ocr_pm25 is not None and pm25 is not None:
        diff = abs(float(ocr_pm25) - pm25)
        reasons.append(f"OCR เป็นข้อมูลช่วยตรวจ ต่างจากค่า Admin {diff:.1f} µg/m³")

    if duplicate_detected:
        score = max(0.0, score - 15.0)
        reasons.append("ภาพคล้ายกับรายงานเดิม ต้องตรวจซ้ำ")

    return {"score": round(max(0.0, min(100.0, score)), 1), "reasons": reasons}


def peer_adjustment(confirm_weight: float, dispute_weight: float) -> float:
    """Peer review adjusts at most ±8 and cannot override Admin moderation."""
    total = confirm_weight + dispute_weight
    if total <= 0:
        return 0.0
    return round(8.0 * (confirm_weight - dispute_weight) / total, 1)


def reviewer_weight(reputation_score: int | float) -> float:
    """Bound reviewer influence to 1..3 so reputation cannot dominate consensus."""
    return round(1.0 + min(2.0, max(0.0, float(reputation_score)) / 100.0), 3)


def star_rating_direction(rating: int) -> str:
    if rating not in {1, 2, 3, 4, 5}:
        raise ValueError("rating must be between 1 and 5")
    return "positive" if rating >= 4 else "negative" if rating <= 2 else "neutral"


def star_consensus(reviews: Sequence[dict], *, minimum_raters: int = 3) -> dict:
    """Calculate reputation-weighted star consensus and bounded trust adjustment."""
    unique: dict[str, dict] = {}
    for review in reviews:
        reviewer_id = str(review.get("reviewer_id") or "")
        rating = int(review.get("rating") or 0)
        if reviewer_id and rating in {1, 2, 3, 4, 5}:
            unique[reviewer_id] = review

    weighted_sum = 0.0
    total_weight = 0.0
    star_sum = 0.0
    for review in unique.values():
        rating = int(review["rating"])
        supplied_weight = review.get("weight")
        weight = (
            max(1.0, min(3.0, float(supplied_weight)))
            if supplied_weight is not None
            else reviewer_weight(review.get("reviewer_reputation", 0))
        )
        weighted_sum += ((rating - 3.0) / 2.0) * weight
        star_sum += rating * weight
        total_weight += weight

    count = len(unique)
    normalized = weighted_sum / total_weight if total_weight else 0.0
    average = star_sum / total_weight if total_weight else 0.0
    direction = (
        "positive"
        if normalized >= 0.5
        else "negative"
        if normalized <= -0.5
        else "neutral"
    )
    adjustment = (
        round(max(-8.0, min(8.0, normalized * 8.0)), 1)
        if count >= minimum_raters
        else 0.0
    )
    return {
        "count": count,
        "average": round(average, 2),
        "normalized": round(normalized, 3),
        "direction": direction,
        "adjustment": adjustment,
    }


def rating_matches_consensus(rating: int, consensus: str) -> bool:
    """Neutral ratings never earn reviewer rewards."""
    return (rating >= 4 and consensus == "positive") or (
        rating <= 2 and consensus == "negative"
    )
