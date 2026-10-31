"""Participation only: never used to calculate Trust, IDW or publication."""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

POLICY_VERSION = "xp-v1"
REPORT_XP = 10
HELP_XP = 5
REPORT_LIMIT = 5
HELP_LIMIT = 3
DAILY_XP_LIMIT = 65
RANKS = (
    ("explorer", "นักสำรวจอากาศ", 0, 0),
    ("reporter", "ผู้รายงานชุมชน", 100, 3),
    ("caretaker", "ผู้ร่วมดูแลอากาศ", 500, 7),
    ("guardian", "ผู้พิทักษ์อากาศ", 1500, 20),
    ("champion", "แกนนำอากาศสะอาด", 5000, 60),
)
REASONS = {
    "granted": "บันทึกคะแนนแล้ว",
    "not_approved": "รายงานไม่ผ่านการตรวจอัตโนมัติ",
    "stale": "ภาพมีอายุเกิน 3 ชั่วโมงขณะส่ง",
    "duplicate": "ภาพซ้ำไม่ได้รับคะแนน",
    "cooldown": "รายงานที่รับคะแนนต้องห่างกันอย่างน้อย 30 นาที",
    "report_limit": "วันนี้รับคะแนนรายงานครบแล้ว",
    "help_limit": "วันนี้รับโบนัสช่วยคำขอครบแล้ว",
    "pair_limit": "รับโบนัสจากผู้ขอรายนี้ครบตามกำหนดแล้ว",
    "no_claim": "ต้องกดช่วยวัดก่อนถ่ายภาพเพื่อรับโบนัส",
    "invalid_evidence": "เวลา ตำแหน่ง หรือหลักฐาน GPS ไม่ผ่านเงื่อนไขโบนัส",
    "request_closed": "พ้นช่วงรับโบนัส หรือคำขอถูกยกเลิกแล้ว",
    "already_rewarded": "ได้รับโบนัสคำขอนี้แล้ว",
}


def stamp(value: str | datetime) -> datetime:
    result = (
        value
        if isinstance(value, datetime)
        else datetime.fromisoformat(value.replace("Z", "+00:00"))
    )
    if result.tzinfo is None:
        raise ValueError("timestamp requires timezone")
    return result.astimezone(UTC)


def thai_day(value: str | datetime) -> str:
    return stamp(value).astimezone(ZoneInfo("Asia/Bangkok")).date().isoformat()


def rank_progress(xp: int, days: int) -> dict:
    eligible = [r for r in RANKS if xp >= r[2] and days >= r[3]]
    current = eligible[-1]
    next_rank = next((r for r in RANKS if r[2] > current[2]), None)
    return {
        "code": current[0],
        "label": current[1],
        "minimum_xp": current[2],
        "minimum_days": current[3],
        "next_label": next_rank[1] if next_rank else None,
        "next_xp": next_rank[2] if next_rank else None,
        "next_days": next_rank[3] if next_rank else None,
    }


def achievements(reports: int, helped: int) -> list[str]:
    return (["รายงานแรก"] if reports else []) + [
        label
        for threshold, label in (
            (1, "ช่วยคำขอแรก"),
            (10, "ช่วยครบ 10 คำขอ"),
            (50, "ช่วยครบ 50 คำขอ"),
        )
        if helped >= threshold
    ]


def base_eligibility(report: dict) -> str:
    if report.get("status") != "approved":
        return "not_approved"
    if report.get("duplicate_of_report_id"):
        return "duplicate"
    age = stamp(report["created_at"]) - stamp(report["captured_at"])
    return "granted" if timedelta(0) <= age <= timedelta(hours=3) else "stale"


def help_eligibility(
    report: dict, request: dict, claim: dict | None, metadata: dict
) -> str:
    from .distance import haversine_km

    if not claim:
        return "no_claim"
    captured, submitted = stamp(report["captured_at"]), stamp(report["created_at"])
    deadline = stamp(request["expires_at"])
    if request["status"] == "fulfilled":
        deadline = min(deadline, stamp(request["updated_at"]) + timedelta(minutes=15))
    if (
        request["status"] == "cancelled"
        and stamp(report.get("moderated_at") or report["created_at"])
        >= stamp(request["updated_at"])
    ) or submitted > deadline:
        return "request_closed"
    gps = metadata.get("bonus_gps_at_submission") or {}
    proven = report.get("capture_source") == "camera" or (
        metadata.get("exif_gps") and metadata.get("exif_captured_at")
    )
    if not (
        proven
        and request["user_id"] != report["user_id"]
        and stamp(claim["started_at"]) <= captured
        and stamp(request["starts_at"]) <= captured <= submitted
        and submitted - captured <= timedelta(minutes=15)
        and gps.get("accuracy_m") is not None
        and 0 <= gps["accuracy_m"] <= 200
        and gps.get("lat") is not None
        and gps.get("lon") is not None
        and haversine_km(report["lat"], report["lon"], gps["lat"], gps["lon"]) <= 0.2
        and haversine_km(report["lat"], report["lon"], request["lat"], request["lon"])
        <= request["radius_km"]
    ):
        return "invalid_evidence"
    return "granted"
