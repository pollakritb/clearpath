import pytest

# ข้าม test ถ้าไม่ได้ติดตั้ง pykrige (อยู่ใน requirements-dev)
pytest.importorskip("pykrige")

from backend.algorithms.kriging import kriging_score_route  # noqa: E402


def test_kriging_runs_and_bounds(stations):
    waypoints = [[13.75, 100.50], [13.74, 100.52], [13.73, 100.54]]
    res = kriging_score_route(waypoints, stations)
    assert len(res["samples"]) == 3
    assert res["avg_pm25"] >= 0
    assert res["max_pm25"] >= res["avg_pm25"]


def test_kriging_needs_enough_stations():
    with pytest.raises(RuntimeError):
        kriging_score_route([[13.0, 100.0]], [{"lat": 13.0, "lon": 100.0, "pm25": 50.0}])
