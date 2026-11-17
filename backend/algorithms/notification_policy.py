"""Pure notification timing and public-message policy."""

from __future__ import annotations

from datetime import timedelta, timezone

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
