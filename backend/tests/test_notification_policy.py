from datetime import UTC, datetime

from backend.algorithms.notification_policy import (
    air_quality_level,
    format_air_alert,
    format_hotspot_alert,
    is_quiet_hour,
)


def test_air_quality_uses_five_air4thai_boundaries():
    assert air_quality_level(15)["label"] == "ดีมาก"
    assert air_quality_level(15.1)["label"] == "ดี"
    assert air_quality_level(25.1)["label"] == "ปานกลาง"
    assert air_quality_level(37.6)["label"] == "เริ่มมีผลกระทบต่อสุขภาพ"
    assert air_quality_level(75.1)["label"] == "มีผลกระทบต่อสุขภาพ"


def test_quiet_hour_supports_overnight_and_same_day_windows():
    # 16:00 UTC is 23:00 in Bangkok.
    late = datetime(2026, 9, 16, 16, 0, tzinfo=UTC)
    noon = datetime(2026, 9, 16, 5, 0, tzinfo=UTC)
    assert is_quiet_hour(late, "22:00", "07:00") is True
    assert is_quiet_hour(noon, "22:00", "07:00") is False
    assert is_quiet_hour(noon, "11:00", "13:00") is True
    assert is_quiet_hour(noon, None, "07:00") is False
    assert is_quiet_hour(noon, "08:00", "08:00") is False


def test_public_alert_messages_include_source_time_area_and_uncertainty():
    air = format_air_alert(
        pm25=40,
        station_name="ศาลากลาง",
        recorded_at="2026-09-16T12:00:00+07:00",
        area="นครปฐม",
    )
    assert "Air4Thai" in air["body"]
    assert "นครปฐม" in air["body"]
    assert "2026-09-16" in air["body"]

    hotspot = format_hotspot_alert(
        acquired_at="2026-09-16T11:00:00+07:00",
        area="นครปฐม",
        satellite="VIIRS",
    )
    assert "จุดความร้อนจากดาวเทียม" in hotspot["title"]
    assert "ยังไม่ใช่เหตุไฟไหม้ที่ยืนยันแล้ว" in hotspot["body"]
    assert "NASA FIRMS (VIIRS)" in hotspot["body"]
