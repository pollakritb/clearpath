import pytest

from backend.algorithms.idw import idw_value


def test_exact_station_returns_its_value(stations):
    s = stations[0]
    assert idw_value(s["lat"], s["lon"], stations) == pytest.approx(s["pm25"])


def test_empty_or_no_usable_returns_none():
    assert idw_value(13.0, 100.0, []) is None
    assert idw_value(13.0, 100.0, [{"lat": 13.0, "lon": 100.0, "pm25": None}]) is None


def test_midpoint_between_two_equal_values():
    st = [
        {"lat": 13.0, "lon": 100.0, "pm25": 50.0},
        {"lat": 13.0, "lon": 100.2, "pm25": 50.0},
    ]
    assert idw_value(13.0, 100.1, st) == pytest.approx(50.0)


def test_closer_station_dominates():
    st = [
        {"lat": 13.0, "lon": 100.0, "pm25": 100.0},  # ใกล้จุดเป้า
        {"lat": 13.0, "lon": 101.0, "pm25": 0.0},  # ไกล
    ]
    val = idw_value(13.0, 100.05, st, power=2, k=5)
    assert val > 50.0  # ควรเอนไปทางสถานีใกล้ (ค่าสูง)


def test_value_bounded_by_inputs(stations):
    val = idw_value(14.0, 100.3, stations)
    lo = min(s["pm25"] for s in stations)
    hi = max(s["pm25"] for s in stations)
    assert lo <= val <= hi
