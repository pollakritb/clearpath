from datetime import UTC, datetime, timedelta
from itertools import permutations

import pytest

from backend.algorithms.nearest_air_alert import (
    nearest_source,
    transition,
    valid_location,
)
from backend.core.config import settings
from backend.services import air_alerts

NOW = datetime(2026, 11, 13, 6, tzinfo=UTC)
POINT = {
    "lat": 14,
    "lon": 100,
    "accuracy_m": 20,
    "observed_at": NOW.isoformat(),
    "version": "v1",
}


def source(kind="station", **patch):
    return {
        "source_type": kind,
        "source_id": "1",
        "lat": 14.001,
        "lon": 100,
        "pm25": 80,
        "source_at": NOW.isoformat(),
        "status": "approved",
        **patch,
    }


def test_nearest_low_community_blocks_far_high_station_in_every_order():
    low = source("community", pm25=20)
    high = source(lat=14.01)
    for items in permutations([low, high]):
        picked = nearest_source(POINT, list(items), 10, NOW)
        assert picked["source_type"] == "community"
        assert not transition({}, picked, 37.6, NOW)["notify"]


@pytest.mark.parametrize(
    "kind,seconds,expected",
    [
        ("station", 3600, True),
        ("station", 3601, False),
        ("community", 10800, True),
        ("community", 10801, False),
        ("station", -1, False),
    ],
)
def test_source_age_boundaries(kind, seconds, expected):
    picked = nearest_source(
        POINT,
        [source(kind, source_at=(NOW - timedelta(seconds=seconds)).isoformat())],
        10,
        NOW,
    )
    assert bool(picked) is expected


@pytest.mark.parametrize(
    "patch",
    [
        {"pm25": float("nan")},
        {"pm25": float("inf")},
        {"pm25": -1},
        {"lat": 91},
        {"lon": None},
        {"source_type": "forecast"},
        {"source_type": "community", "status": "rejected"},
        {"source_at": "2026-11-13"},
    ],
)
def test_invalid_sources_never_trigger(patch):
    assert nearest_source(POINT, [source(**patch)], 10, NOW) is None


@pytest.mark.parametrize(
    "patch",
    [
        {"accuracy_m": 201},
        {"accuracy_m": -1},
        {"lat": float("inf")},
        {"lon": 181},
        {"observed_at": (NOW - timedelta(hours=24, seconds=1)).isoformat()},
        {"observed_at": (NOW + timedelta(seconds=1)).isoformat()},
    ],
)
def test_invalid_locations(patch):
    assert not valid_location({**POINT, **patch}, NOW)


def test_stale_nearest_falls_back_to_fresh_pin_and_ties_are_deterministic():
    candidates = [
        source(source_id="old", source_at=(NOW - timedelta(hours=2)).isoformat()),
        source(source_id="fresh", lat=14.02),
    ]
    assert nearest_source(POINT, candidates, 10, NOW)["source_id"] == "fresh"
    candidates = [source(source_id="b"), source(source_id="a")]
    assert nearest_source(POINT, candidates, 10, NOW)["source_id"] == "a"
    assert nearest_source(POINT, [source(lat=15)], 1, NOW) is None


def test_episode_no_spam_switching_source_missing_data_escalation_and_recovery():
    state = transition({}, source(pm25=40), 37.6, NOW)
    assert state["notify"]
    assert not transition(
        state, source(source_id="other", pm25=50), 37.6, NOW + timedelta(minutes=1)
    )["notify"]
    missing = transition(state, None, 37.6, NOW + timedelta(minutes=2))
    assert missing["severity"] == 1
    escalated = transition(state, source(pm25=76), 37.6, NOW + timedelta(minutes=3))
    assert escalated["notify"] and escalated["severity"] == 2
    low = transition(escalated, source(pm25=20), 37.6, NOW + timedelta(hours=1))
    recovered = transition(
        low, source(pm25=20), 37.6, NOW + timedelta(hours=1, minutes=30)
    )
    assert recovered["severity"] == 0
    assert transition(recovered, source(pm25=40), 37.6, NOW + timedelta(hours=2))[
        "notify"
    ]


def test_delivery_rechecks_latest_location_and_source(monkeypatch):
    prefs = {
        "consent_granted": True,
        "air_alerts": True,
        "updated_at": "p1",
        "pm25_threshold": 37.6,
    }
    chosen = {**source(), "policy_version": "nearest-pin-v1"}
    payload = {**chosen, "location_version": "v1", "preferences_at": "p1"}
    monkeypatch.setattr(air_alerts, "selected", lambda _: (prefs, POINT, chosen))
    assert air_alerts.delivery_allowed("user", payload)
    assert not air_alerts.delivery_allowed(
        "user", {**payload, "location_version": "older"}
    )
    assert not air_alerts.delivery_allowed(
        "user", {**payload, "source_id": "different"}
    )
    assert not air_alerts.delivery_allowed(
        "user", {**payload, "policy_version": "legacy"}
    )
    prefs["consent_granted"] = False
    assert not air_alerts.delivery_allowed("user", payload)


def test_location_old_callback_cannot_overwrite_new(monkeypatch):
    monkeypatch.setattr(settings, "local_demo_mode", True)
    monkeypatch.setattr(air_alerts, "LOCATIONS", {})
    monkeypatch.setattr(
        air_alerts.supabase_client,
        "get_notification_preferences",
        lambda _: {"consent_granted": True},
    )
    now = datetime.now(UTC)
    new = air_alerts.save_location("u", {**POINT, "observed_at": now.isoformat()})
    old = air_alerts.save_location(
        "u",
        {**POINT, "lat": 15, "observed_at": (now - timedelta(minutes=1)).isoformat()},
    )
    assert new == old
    air_alerts.clear_location("u")
    assert air_alerts.location("u") is None


def test_location_api_owner_validation_and_privacy(monkeypatch):
    from fastapi.testclient import TestClient

    from backend.core.auth import AuthenticatedUser, require_user
    from backend.main import create_app

    monkeypatch.setattr(settings, "local_demo_mode", True)
    monkeypatch.setattr(air_alerts, "LOCATIONS", {})
    monkeypatch.setattr(
        air_alerts.supabase_client,
        "get_notification_preferences",
        lambda _: {"consent_granted": True, "air_alerts": True},
    )
    monkeypatch.setattr(air_alerts.supabase_client, "take_rate_limit", lambda *_: True)
    app = create_app()
    app.dependency_overrides[require_user] = lambda: AuthenticatedUser(
        "owner", None, "user"
    )
    client = TestClient(app)
    payload = {
        **POINT,
        "observed_at": datetime.now(UTC).isoformat(),
        "user_id": "someone-else",
    }
    # Extra identity cannot change the authenticated owner, nor leak exact GPS.
    response = client.put("/api/notifications/location", json=payload)
    assert response.status_code == 200
    assert response.json()["status"] == "ready"
    assert (
        "owner" in air_alerts.LOCATIONS and "someone-else" not in air_alerts.LOCATIONS
    )
    assert "lat" not in response.json() and "lon" not in response.json()
    assert (
        client.put(
            "/api/notifications/location", json={**payload, "accuracy_m": 201}
        ).status_code
        == 422
    )
    assert client.delete("/api/notifications/location").status_code == 200
    assert client.get("/api/notifications/location").json()["status"] == "missing"


def test_message_keeps_precision_and_labels_thai_time():
    notice = air_alerts.notice_for(
        {**source(pm25=75.01), "distance_km": 0.2}, POINT, {}, "key"
    )
    assert "75.01" in notice["title"]
    assert "เวลาไทย" in notice["body"] and "13:00" in notice["body"]


def test_canary_uses_same_profile_identity_in_evaluation_and_delivery(monkeypatch):
    monkeypatch.setattr(settings, "line_alert_canary_user_ids", "1, 2")
    assert air_alerts.in_canary("1")
    assert air_alerts.in_canary("USR-000001")
    assert not air_alerts.in_canary("USR-000003")
    monkeypatch.setattr(settings, "line_alert_shadow_mode", True)
    assert not air_alerts.delivery_allowed(
        "USR-000001", {"policy_version": "nearest-pin-v1"}
    )


def test_nearest_lookup_does_not_mutate_input_candidates():
    from copy import deepcopy

    sources = [source("community", pm25=20), source(lat=14.02)]
    before = deepcopy(sources)
    nearest_source(POINT, sources, 10, NOW)
    assert sources == before
