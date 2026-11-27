"""Historical v2 policy checks and shared GPS/current service regressions."""

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


def test_daily_no_spam_switching_source_missing_data_escalation_and_recovery():
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
    assert recovered["severity"] == 2
    assert not transition(recovered, source(pm25=40), 37.6, NOW + timedelta(hours=2))[
        "notify"
    ]


def test_delivery_rechecks_latest_location_and_source(monkeypatch):
    prefs = {
        "consent_granted": True,
        "air_alerts": True,
        "updated_at": "p1",
        "pm25_threshold": 37.6,
    }
    chosen = {**source(), "policy_version": air_alerts.POLICY_VERSION}
    payload = {
        **chosen,
        "location_version": "v1",
        "preferences_at": "p1",
        "alert_day": air_alerts.alert_day(datetime.now(UTC)),
        "alert_severity": 2,
    }
    monkeypatch.setattr(
        air_alerts, "selected_sources", lambda _: (prefs, POINT, [chosen])
    )
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


def test_valid_browser_gps_activates_legacy_consent_without_changing_switches(
    monkeypatch,
):
    monkeypatch.setattr(settings, "local_demo_mode", True)
    monkeypatch.setattr(air_alerts, "LOCATIONS", {})
    prefs = {
        "consent_granted": False,
        "air_alerts": True,
        "line_enabled": False,
        "air_alert_warning": False,
        "air_alert_danger": True,
    }
    monkeypatch.setattr(
        air_alerts.supabase_client, "get_notification_preferences", lambda _: prefs
    )
    writes = []
    monkeypatch.setattr(
        air_alerts.supabase_client,
        "upsert_notification_preferences",
        lambda user, values: writes.append((user, values)),
    )
    air_alerts.save_location(
        "owner", {**POINT, "observed_at": datetime.now(UTC).isoformat()}
    )
    assert writes[0][0] == "owner"
    assert set(writes[0][1]) == {"consent_granted", "consent_granted_at"}
    assert writes[0][1]["consent_granted"] is True
    assert prefs["line_enabled"] is False and prefs["air_alert_warning"] is False


@pytest.mark.parametrize("disabled,accuracy", [(True, 20), (False, 201)])
def test_disabled_alerts_or_invalid_gps_cannot_activate_consent(
    monkeypatch, disabled, accuracy
):
    monkeypatch.setattr(
        air_alerts.supabase_client,
        "get_notification_preferences",
        lambda _: {"consent_granted": False, "air_alerts": not disabled},
    )

    def unexpected_write(*args):
        pytest.fail("must not activate notification preferences")

    monkeypatch.setattr(
        air_alerts.supabase_client, "upsert_notification_preferences", unexpected_write
    )
    with pytest.raises(ValueError):
        air_alerts.save_location(
            "owner",
            {
                **POINT,
                "accuracy_m": accuracy,
                "observed_at": datetime.now(UTC).isoformat(),
            },
        )


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


@pytest.mark.parametrize("kind", ["station", "community"])
def test_line_request_contains_complete_pin_context_without_provider_io(
    monkeypatch, kind
):
    from backend.services import line_messaging

    monkeypatch.setattr(settings, "app_public_url", "https://clearpath.example")
    monkeypatch.setattr(
        line_messaging.supabase_client,
        "get_line_notification_link",
        lambda _: {"active": True, "line_user_id": "U" + "1" * 32},
    )
    notice = air_alerts.notice_for(
        {**source(kind, pm25=40, name="สถานีทดสอบ"), "distance_km": 0.2},
        POINT,
        {},
        "key",
    )
    request = line_messaging.prepare_push("1", notice)
    text = request["messages"][0]["text"]
    assert "PM2.5 40 µg/m³" in text
    assert "37.6–75.0" in text and "เริ่มมีผลกระทบต่อสุขภาพ" in text
    assert "200 เมตร" in text and "ภายใน 2 กม." in text
    assert "วัดเมื่อ: 13/11/2026 13:00" in text
    assert "GPS อ้างอิงที่บันทึก:" in text and "คำแนะนำ:" in text
    pin = "1" if kind == "station" else "RPT-000001"
    query = "station" if kind == "station" else "report"
    assert f"หมุดอ้างอิง: {pin}" in text
    assert text.endswith(f"https://clearpath.example/?{query}={pin}")
    assert ("สถานีทดสอบ" in text) == (kind == "station")
    assert ("ข้อมูลชุมชนเป็นข้อมูลเสริม" in text) == (kind == "community")


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


def test_daily_quota_resets_at_thai_midnight_without_waiting_for_a_cooldown():
    before = datetime(2026, 11, 15, 16, 59, 59, tzinfo=UTC)
    state = transition({}, source(pm25=50), 500, before)
    assert state["notify"] and state["alert_day"] == "2026-11-15"
    state = transition(state, source(pm25=80), 500, before)
    assert state["notify"] and state["severity"] == 2
    assert not transition(state, source(pm25=50), 0, before)["notify"]
    following = transition(state, source(pm25=50), 500, before + timedelta(seconds=1))
    assert following["notify"] and following["alert_day"] == "2026-11-16"
    assert following["severity"] == 1


def test_independent_band_opt_outs_do_not_consume_the_other_band():
    state = transition({}, source(pm25=50), 37.6, NOW, warning_enabled=False)
    assert not state["notify"] and state["severity"] == 0
    high = transition(state, source(pm25=80), 37.6, NOW, warning_enabled=False)
    assert high["notify"]
    disabled = transition({}, source(pm25=80), 37.6, NOW, danger_enabled=False)
    assert not disabled["notify"]
    assert transition(disabled, source(pm25=50), 37.6, NOW, danger_enabled=False)[
        "notify"
    ]


def test_selected_sources_uses_fixed_two_kilometres_even_for_legacy_custom_preferences(
    monkeypatch,
):
    now = datetime.now(UTC)
    point = {**POINT, "observed_at": now.isoformat()}
    monkeypatch.setattr(air_alerts, "location", lambda _: point)
    monkeypatch.setattr(
        air_alerts.supabase_client,
        "get_notification_preferences",
        lambda _: {"radius_km": 50, "pm25_threshold": 500},
    )
    seen = []

    def candidates(_point, radius):
        seen.append(radius)
        return [source(lat=14.03, source_at=now.isoformat())]

    monkeypatch.setattr(air_alerts, "candidates", candidates)
    assert air_alerts.selected_sources("user", now)[2] == []
    assert seen == [2.0]


def test_retired_custom_settings_are_normalized_without_overriding_opt_outs():
    from backend.models.notifications import NotificationPreferences

    preferences = NotificationPreferences(
        radius_km=50,
        pm25_threshold=500,
        quiet_hours_start="22:00",
        quiet_hours_end="07:00",
        air_alert_warning=False,
        line_enabled=False,
        consent_granted=False,
    )
    assert preferences.radius_km == 2
    assert preferences.pm25_threshold == 37.6
    assert preferences.quiet_hours_start is None and preferences.quiet_hours_end is None
    assert not preferences.air_alert_warning
    assert preferences.air_alert_danger
    assert not preferences.line_enabled and not preferences.consent_granted
