from backend.core.aqi import classify_pm25


def test_pcd_2566_pm25_boundaries():
    assert classify_pm25(15)["level"] == "ดีมาก"
    assert classify_pm25(15.1)["level"] == "ดี"
    assert classify_pm25(25)["level"] == "ดี"
    assert classify_pm25(25.1)["level"] == "ปานกลาง"
    assert classify_pm25(37.5)["level"] == "ปานกลาง"
    assert classify_pm25(37.6)["level"] == "เริ่มมีผลกระทบต่อสุขภาพ"
    assert classify_pm25(75)["level"] == "เริ่มมีผลกระทบต่อสุขภาพ"
    assert classify_pm25(75.1)["level"] == "มีผลกระทบต่อสุขภาพ"


def test_unknown_pm25_is_neutral():
    result = classify_pm25(None)
    assert result["level"] is None
    assert result["color"] == "#95a5a6"
