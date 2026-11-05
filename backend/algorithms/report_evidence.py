"""Explainable evidence rubric; no reputation, social votes or reference agreement."""

from datetime import datetime
from math import isfinite

from .community_quality import corroboration_count
from .community_xp import stamp

VERSION = "evidence-v2"


def score_evidence(report: dict, facts: dict) -> dict:
    checks = []

    def check(code, maximum, points, state, reason):
        checks.append(
            dict(code=code, maximum=maximum, points=points, state=state, reason=reason)
        )

    numeric = report.get("ocr_pm25")
    numeric_ok = type(numeric) in (int, float) and isfinite(numeric) and numeric >= 0
    check(
        "number",
        20,
        20 if numeric_ok else 0,
        "verified" if numeric_ok else "unknown",
        "อ่านตัวเลขจากภาพได้" if numeric_ok else "ยังไม่มีผลอ่านตัวเลข",
    )
    for key, label in [
        ("pm25_field_verified", "ระบุช่อง PM2.5"),
        ("unit_verified", "ระบุหน่วย µg/m³"),
    ]:
        value = facts.get(key)
        check(
            key,
            10,
            10 if value is True else 0,
            "verified" if value is True else "invalid" if value is False else "unknown",
            label + ("แล้ว" if value is True else "ยังยืนยันไม่ได้"),
        )
    provenance = facts.get("capture_provenance_verified") is True
    check(
        "provenance",
        15,
        15 if provenance else 0,
        "verified" if provenance else "unknown",
        "เชื่อมภาพกับหลักฐานเวลา" if provenance else "ยังไม่มีหลักฐานที่มาภาพ",
    )
    try:
        age = (
            stamp(report["created_at"]) - stamp(report["captured_at"])
        ).total_seconds() / 60
    except (KeyError, TypeError, ValueError, AttributeError):
        age = -1
    age_points = (
        15 if 0 <= age <= 15 else 10 if 15 < age <= 60 else 5 if 60 < age <= 180 else 0
    )
    check(
        "time",
        15,
        age_points,
        "verified" if age_points else "unknown",
        "อายุภาพขณะส่ง ไม่ใช่อายุข้อมูลปัจจุบัน",
    )
    accuracy = report.get("gps_accuracy_m")
    valid_gps = (
        isinstance(accuracy, (float, int))
        and isfinite(accuracy)
        and 0 <= accuracy <= 200
    )
    gps_points = (
        (20 if accuracy <= 50 else 15 if accuracy <= 100 else 10) if valid_gps else 0
    )
    check(
        "gps",
        20,
        gps_points,
        "verified" if valid_gps else "unknown",
        "GPS ณ จุดวัด" if valid_gps else "ไม่มี GPS ที่ใช้ยืนยันได้",
    )
    coherent = facts.get("location_time_verified") is True and not report.get(
        "clock_warning"
    )
    check(
        "coherence",
        5,
        5 if coherent else 0,
        "verified" if coherent else "unknown",
        "หลักฐานเวลาและตำแหน่งสอดคล้อง",
    )
    context = facts.get("context_recorded") is True
    check(
        "context",
        5,
        5 if context else 0,
        "declared" if context else "unknown",
        "บริบทผู้ใช้ระบุ ไม่ใช่ผลตรวจเทียบเครื่อง",
    )
    blockers = [
        c["code"]
        for c in checks
        if c["code"]
        in {
            "number",
            "pm25_field_verified",
            "unit_verified",
            "provenance",
            "time",
            "gps",
            "coherence",
        }
        and c["points"] == 0
    ]
    if report.get("duplicate_of_report_id"):
        blockers.append("duplicate")
    return dict(
        policy_version=VERSION,
        score=round(sum(c["points"] for c in checks), 1),
        components=checks,
        blockers=blockers,
        scored_at=report.get("created_at"),
        device_status="identified" if report.get("device_model") else "unknown",
    )


def evidence_gap_fill(
    report: dict,
    evidence: dict | None,
    *,
    now: datetime,
    official_nearby: bool,
    independent_sources: int,
    threshold: float | None,
) -> dict:
    reason = None
    if threshold is None:
        reason = "เกณฑ์หลักฐานรุ่นใหม่ยังไม่ผ่านการประเมิน"
    elif not evidence or evidence.get("policy_version") != VERSION:
        reason = "ยังไม่มีหลักฐานรุ่นใหม่"
    elif report.get("current_evidence_issues"):
        reason = "ผลตรวจอิสระพบปัญหาในหลักฐาน ต้องใช้ผลตรวจที่แก้ข้อสงสัยได้ก่อน"
    elif evidence["blockers"]:
        reason = "หลักฐานสำคัญยังไม่ครบหรือขัดแย้ง"
    elif evidence["score"] < threshold:
        reason = "คะแนนหลักฐานยังไม่ถึงเกณฑ์"
    elif report.get("status") != "approved":
        reason = "รายงานยังไม่เผยแพร่"
    else:
        try:
            age = (now - stamp(report["captured_at"])).total_seconds()
        except (KeyError, ValueError, TypeError, AttributeError):
            age = -1
        if not 0 <= age <= 10800:
            reason = "ข้อมูลหมดอายุหรือเวลาใช้ไม่ได้"
        elif official_nearby:
            reason = "มี Air4Thai สดภายใน 5 กม."
        elif report.get("measurement_environment") != "outdoor" or report.get(
            "near_emission_source"
        ):
            reason = "บริบทไม่เหมาะสำหรับพื้นผิวกลางแจ้ง"
        elif independent_sources < 2:
            reason = "ต้องมีแหล่งวัดอิสระอย่างน้อย 2 ชุดใน 2 กม./1 ชม."
    return dict(
        eligible=reason is None,
        basis="corroborated" if reason is None else "none",
        reason=reason or "หลักฐานครบและมีแหล่งวัดอิสระสนับสนุน",
    )


def history_summary(outcomes: list[dict]) -> dict:
    counts = {
        status: sum(o.get("outcome") == status for o in outcomes)
        for status in ["pass", "problem", "unresolved"]
    }
    n = counts["pass"] + counts["problem"]
    return dict(
        first_checked_at=min(
            (o["evaluated_at"] for o in outcomes if o.get("evaluated_at")), default=None
        ),
        last_checked_at=max(
            (o["evaluated_at"] for o in outcomes if o.get("evaluated_at")), default=None
        ),
        passed=counts["pass"],
        problems=counts["problem"],
        unresolved=counts["unresolved"],
        evaluated=n,
        pass_rate=round(100 * counts["pass"] / n, 1) if n else None,
        status="evaluated" if n else "insufficient",
        scope="independent_evidence_checks",
    )


def independent_evidence_sources(
    target: dict, reports: list[dict], *, now: datetime, threshold: float | None
) -> int:
    """Unknown source identity is not evidence of independence. Private keys only."""
    if not target.get("measurement_source_key"):
        return 0
    eligible = []
    seen_sources = set()
    for row in [
        target,
        *sorted(reports, key=lambda r: str(r.get("captured_at", "")), reverse=True),
    ]:
        source = row.get("measurement_source_key")
        evidence = row.get("evidence_v2")
        decision = evidence_gap_fill(
            row,
            evidence,
            now=now,
            official_nearby=False,
            independent_sources=2,
            threshold=threshold,
        )
        if not source or source in seen_sources or not decision["eligible"]:
            continue
        if row.get("averaging_period") != target.get("averaging_period"):
            continue
        seen_sources.add(source)
        eligible.append(row)
    if not any(str(r["id"]) == str(target["id"]) for r in eligible):
        return 0
    return corroboration_count(target, eligible)
