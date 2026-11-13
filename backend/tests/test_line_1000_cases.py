"""1,000 distinct input cases + 1,000 reproducible state paths.

Independent spherical-distance and symbolic episode oracles; no network/DB sends.
Each parametrized item has a stable descriptive ID for failure reproduction.
"""

from datetime import UTC, datetime, timedelta
from itertools import product
from math import atan2, cos, isfinite, radians, sin, sqrt

import pytest

from backend.algorithms.nearest_air_alert import nearest_source, transition

NOW = datetime(2026, 11, 13, 6, tzinfo=UTC)
CASES = list(
    product(
        ("station", "community"),
        ("now", "boundary", "expired", "future", "almost_expired"),
        (0, 37.5, 37.6, 75, 75.1),
        (0, 10, 200, 201, None),
        (1, 2, 10, 50),
    )
)
assert len(CASES) == 1000


def arc_distance(a, b):
    # atan2 of cross/dot unit vectors, independent of the runtime haversine.
    vectors = []
    for lat, lon in (a, b):
        lat, lon = radians(lat), radians(lon)
        vectors.append((cos(lat) * cos(lon), cos(lat) * sin(lon), sin(lat)))
    x, y = vectors
    cross = (
        x[1] * y[2] - x[2] * y[1],
        x[2] * y[0] - x[0] * y[2],
        x[0] * y[1] - x[1] * y[0],
    )
    return 6371.0088 * atan2(
        sqrt(sum(v * v for v in cross)), sum(u * v for u, v in zip(x, y, strict=True))
    )


def oracle(point, sources, radius):
    accuracy = point["accuracy_m"]
    if accuracy is None or not 0 <= accuracy <= 200:
        return None
    eligible = []
    for source in sources:
        age = (NOW - datetime.fromisoformat(source["source_at"])).total_seconds()
        limit = 3600 if source["source_type"] == "station" else 10800
        if not 0 <= age <= limit or not isfinite(source["pm25"]) or source["pm25"] < 0:
            continue
        if source["source_type"] == "community" and source["status"] != "approved":
            continue
        distance = arc_distance(
            (point["lat"], point["lon"]), (source["lat"], source["lon"])
        )
        if distance <= radius:
            eligible.append(
                (
                    distance,
                    -datetime.fromisoformat(source["source_at"]).timestamp(),
                    source["source_type"] + ":" + source["source_id"],
                    source,
                )
            )
    return min(eligible, key=lambda row: row[:3])[3] if eligible else None


@pytest.mark.parametrize(
    "case",
    CASES,
    ids=[
        f"case-{i:04d}-{c[0]}-{c[1]}-pm{c[2]}-gps{c[3]}-r{c[4]}"
        for i, c in enumerate(CASES)
    ],
)
def test_1000_nearest_pin_input_cases(case):
    kind, age_case, pm25, accuracy, radius = case
    index = CASES.index(case)
    lat = 7 + (index % 140) / 10
    lon = 98 + (index % 70) / 10
    ttl = 3600 if kind == "station" else 10800
    age = {
        "now": 0,
        "boundary": ttl,
        "expired": ttl + 1,
        "future": -1,
        "almost_expired": ttl - 1,
    }[age_case]
    point = {
        "lat": lat,
        "lon": lon,
        "accuracy_m": accuracy,
        "observed_at": NOW.isoformat(),
    }
    near = {
        "source_type": kind,
        "source_id": "near",
        "lat": lat + 0.004,
        "lon": lon,
        "pm25": pm25,
        "source_at": (NOW - timedelta(seconds=age)).isoformat(),
        "status": "rejected" if index % 17 == 0 else "approved",
    }
    far = {
        "source_type": "station",
        "source_id": "far-high",
        "lat": lat + 0.02,
        "lon": lon,
        "pm25": 150,
        "source_at": NOW.isoformat(),
        "status": "approved",
    }
    invalid = {**near, "source_id": "invalid-closest", "lat": lat, "pm25": float("nan")}
    sources = [near, far, invalid]
    expected = oracle(point, sources, radius)
    actual = nearest_source(point, sources, radius, NOW)
    assert (actual["source_id"] if actual else None) == (
        expected["source_id"] if expected else None
    )
    reversed_result = nearest_source(point, list(reversed(sources)), radius, NOW)
    assert actual == reversed_result, "input order must not affect nearest pin"
    if actual:
        independent = arc_distance((lat, lon), (actual["lat"], actual["lon"]))
        assert abs(actual["distance_km"] - independent) < 1e-7
        assert transition({}, actual, 37.6, NOW)["notify"] == (actual["pm25"] >= 37.6)


EVENTS = ("low", "warning", "danger", "missing", "switch_pin")
PATHS = [
    tuple(EVENTS[((i * 137 + 41) % 3125 // 5**j) % 5] for j in range(5))
    for i in range(1000)
]
assert len(set(PATHS)) == 1000


@pytest.mark.parametrize(
    "index,events",
    list(enumerate(PATHS)),
    ids=[f"path-{i:04d}-" + "-".join(events) for i, events in enumerate(PATHS)],
)
def test_1000_episode_state_paths(index, events):
    state = {}
    peak = 0
    last_notice = None
    low_start = None
    now = NOW
    for step, event in enumerate(events):
        now += timedelta(seconds=(60, 600, 1800, 3600)[(index + step) % 4])
        expected = False
        if event == "missing":
            low_start = None
            source = None
        else:
            pm25 = {"low": 20, "warning": 40, "danger": 80, "switch_pin": 45}[event]
            source = {
                "pm25": pm25,
                "source_id": f"pin-{step}" if event == "switch_pin" else "original",
            }
            if event == "low":
                if low_start is None:
                    low_start = now
                elif (now - low_start).total_seconds() >= 1800:
                    peak = 0
            else:
                low_start = None
                target = 2 if event == "danger" else 1
                may_reenter = (
                    peak > 0
                    or last_notice is None
                    or (now - last_notice).total_seconds() >= 3600
                )
                if target > peak and may_reenter:
                    expected = True
                    peak = target
                    last_notice = now
        state = transition(state, source, 37.6, now)
        assert state["notify"] is expected, {
            "path": index,
            "step": step,
            "event": event,
        }
        assert state.get("severity", 0) == peak
        if event == "missing":
            assert state["low_since"] is None
