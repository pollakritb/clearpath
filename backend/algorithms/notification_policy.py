"""Pure notification timing and public-message policy."""

from __future__ import annotations

from datetime import datetime, time, timedelta, timezone

BANGKOK_TZ = timezone(timedelta(hours=7), name="Asia/Bangkok")


AIR_QUALITY_LEVELS = (
    (15.0, "ดีมาก", "ใช้ชีวิตกลางแจ้งได้ตามปกติ", "info"),
    (25.0, "ดี", "ทำกิจกรรมกลางแจ้งได้ตามปกติ", "info"),
    (37.5, "ปานกลาง", "กลุ่มเสี่ยงควรสังเกตอาการเมื่ออยู่นอกอาคาร", "watch"),
    (75.0, "เริ่มมีผลกระทบต่อสุขภาพ", "ลดกิจกรรมกลางแจ้ง โดยเฉพาะกลุ่มเสี่ยง", "warning"),
    (
        float("inf"),
        "มีผลกระทบต่อสุขภาพ",
        "หลีกเลี่ยงกิจกรรมกลางแจ้งและติดตามคำแนะนำทางการ",
        "danger",
    ),
)


def air_quality_level(pm25: float) -> dict[str, str]:
    """Return the Air4Thai-aligned five-level PM2.5 public message."""
    value = max(0.0, float(pm25))
    for upper, label, advice, severity in AIR_QUALITY_LEVELS:
        if value <= upper:
            return {"label": label, "advice": advice, "severity": severity}
    raise AssertionError("unreachable")


def is_quiet_hour(
    now: datetime,
    start: str | None,
    end: str | None,
    timezone: str = "Asia/Bangkok",
) -> bool:
    """Return whether ``now`` falls inside a same-day or overnight quiet window."""
    if not start or not end or start == end:
        return False
    if timezone != "Asia/Bangkok":
        raise ValueError("unsupported notification timezone")
    local_now = now.astimezone(BANGKOK_TZ).time().replace(tzinfo=None)
    start_time = time.fromisoformat(start)
    end_time = time.fromisoformat(end)
    if start_time < end_time:
        return start_time <= local_now < end_time
    return local_now >= start_time or local_now < end_time


def format_air_alert(
    *, pm25: float, station_name: str, recorded_at: str, area: str
) -> dict[str, str]:
    level = air_quality_level(pm25)
    return {
        "title": f"PM2.5 {level['label']}ที่ {station_name}",
        "body": (
            f"{pm25:.1f} µg/m³ · {level['advice']} · "
            f"พื้นที่ {area} · เวลา {recorded_at} · ที่มา Air4Thai"
        ),
        "severity": level["severity"],
    }


def format_hotspot_alert(
    *, acquired_at: str, area: str, satellite: str | None = None
) -> dict[str, str]:
    source = "NASA FIRMS"
    if satellite:
        source = f"NASA FIRMS ({satellite})"
    return {
        "title": f"พบจุดความร้อนจากดาวเทียมใน {area}",
        "body": (
            f"ยังไม่ใช่เหตุไฟไหม้ที่ยืนยันแล้ว · พื้นที่ {area} · เวลา {acquired_at} · ที่มา {source}"
        ),
        "severity": "warning",
    }
