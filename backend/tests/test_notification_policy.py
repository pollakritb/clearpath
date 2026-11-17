from backend.algorithms.notification_policy import (
    air_quality_level,
    format_hotspot_alert,
)


def test_air_quality_uses_five_air4thai_boundaries():
    assert air_quality_level(15)["label"] == "ดีมาก"
    assert air_quality_level(15.1)["label"] == "ดี"
    assert air_quality_level(25.1)["label"] == "ปานกลาง"
    assert air_quality_level(37.6)["label"] == "เริ่มมีผลกระทบต่อสุขภาพ"
    assert air_quality_level(75.1)["label"] == "มีผลกระทบต่อสุขภาพ"


def test_public_alert_messages_include_source_time_area_and_uncertainty():
    hotspot = format_hotspot_alert(
        acquired_at="2026-09-16T11:00:00+07:00",
        area="นครปฐม",
        satellite="VIIRS",
    )
    assert "จุดความร้อนจากดาวเทียม" in hotspot["title"]
    assert "ยังไม่ใช่เหตุไฟไหม้ที่ยืนยันแล้ว" in hotspot["body"]
    assert "NASA FIRMS (VIIRS)" in hotspot["body"]
