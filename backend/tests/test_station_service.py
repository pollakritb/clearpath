from backend.services.stations import _sanitize_station


def test_stored_negative_sentinel_fails_closed():
    station = _sanitize_station(
        {"id": "bad-reading", "pm25": -1, "aqi": -1, "color": "#3b82f6"}
    )

    assert station["pm25"] is None
    assert station["aqi"] is None
    assert station["level"] is None
    assert station["color"] == "#95a5a6"


def test_valid_stored_reading_is_reclassified_consistently():
    station = _sanitize_station(
        {"id": "valid-reading", "pm25": "42.5", "aqi": "89", "color": None}
    )

    assert station["pm25"] == 42.5
    assert station["aqi"] == 89
    assert station["level"] == "เริ่มมีผลกระทบต่อสุขภาพ"
    assert station["color"] == "#f97316"
