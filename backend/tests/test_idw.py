import pytest

from backend.algorithms.idw import idw_value, route_confidence, score_route


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
        {"lat": 13.0, "lon": 101.0, "pm25": 0.0},    # ไกล
    ]
    val = idw_value(13.0, 100.05, st, power=2, k=5)
    assert val > 50.0  # ควรเอนไปทางสถานีใกล้ (ค่าสูง)


def test_value_bounded_by_inputs(stations):
    val = idw_value(14.0, 100.3, stations)
    lo = min(s["pm25"] for s in stations)
    hi = max(s["pm25"] for s in stations)
    assert lo <= val <= hi


def test_score_route_basic(stations):
    waypoints = [[13.75, 100.50], [13.74, 100.52], [13.73, 100.54]]
    res = score_route(waypoints, stations)
    assert res["samples"] and len(res["samples"]) == 3
    assert res["avg_pm25"] > 0
    assert res["max_pm25"] >= res["avg_pm25"]


def test_confidence_high_when_near_stations():
    st = [{"lat": 13.0, "lon": 100.0, "pm25": 40.0}]
    wp = [[13.0, 100.0], [13.01, 100.01]]  # ภายใน ~2 กม.
    c = route_confidence(wp, st)
    assert c["confidence"] == pytest.approx(1.0)
    assert c["label"] == "สูง"


def test_confidence_low_when_far_from_stations():
    st = [{"lat": 13.0, "lon": 100.0, "pm25": 40.0}]
    wp = [[18.0, 100.0]]  # ห่าง ~550 กม. → คะแนน 0
    c = route_confidence(wp, st)
    assert c["confidence"] == pytest.approx(0.0)
    assert c["label"] == "ต่ำ"
    assert c["avg_nearest_km"] > 25


def test_confidence_no_usable_stations():
    c = route_confidence([[13.0, 100.0]], [{"lat": 13.0, "lon": 100.0, "pm25": None}])
    assert c["confidence"] == 0.0
    assert c["label"] == "ต่ำ"
    assert c["avg_nearest_km"] is None


def test_score_route_covered_flag(stations):
    assert score_route([[13.75, 100.50]], stations)["covered"] is True


def test_score_route_no_coverage_not_zero_clean():
    # ไม่มีสถานีใช้ได้ → covered=False (ไม่นับว่า "สะอาดสุด" จาก avg=0)
    res = score_route([[13.0, 100.0]], [])
    assert res["covered"] is False
    assert res["samples"] == []
