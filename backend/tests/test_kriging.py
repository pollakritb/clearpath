# ข้าม test ถ้าไม่ได้ติดตั้ง pykrige (อยู่ใน requirements-dev)
import pytest

# ข้าม test ถ้าไม่ได้ติดตั้ง pykrige (อยู่ใน requirements-dev)
pytest.importorskip("pykrige")

from backend.algorithms.kriging import kriging_value  # noqa: E402


def test_kriging_runs_and_bounds(stations):
    value = kriging_value(13.75, 100.50, stations)
    assert value is not None and value >= 0


def test_kriging_needs_enough_stations():
    assert (
        kriging_value(13.0, 100.0, [{"lat": 13.0, "lon": 100.0, "pm25": 50.0}]) is None
    )
