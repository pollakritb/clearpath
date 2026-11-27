from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import pytest

from backend.algorithms.nearby_air_alert import (
    POLICY_VERSION,
    alert_sources,
    observation_key,
)
from backend.services import air_alerts, local_store


def station(identifier="s1", **values):
    return {
        "source_type": "station",
        "source_id": identifier,
        "name": identifier,
        "lat": 14.001,
        "lon": 100,
        "pm25": 50,
        "source_at": datetime.now(UTC).isoformat(),
        **values,
    }


@pytest.fixture
def environment(monkeypatch):
    now = datetime.now(UTC)
    point = {
        "lat": 14,
        "lon": 100,
        "accuracy_m": 10,
        "observed_at": now.isoformat(),
        "version": "v1",
    }
    prefs = {
        "air_alerts": True,
        "consent_granted": True,
        "line_enabled": False,
        "air_alert_warning": True,
        "air_alert_danger": True,
        "updated_at": "p1",
    }
    monkeypatch.setattr(air_alerts.settings, "local_demo_mode", True)
    monkeypatch.setattr(air_alerts.settings, "line_alert_shadow_mode", False)
    monkeypatch.setattr(air_alerts.settings, "line_alert_canary_user_ids", "")
    monkeypatch.setattr(
        air_alerts, "LOCATIONS", {"recipient": point, "other-recipient": point}
    )
    monkeypatch.setattr(air_alerts, "STATES", {})
    monkeypatch.setattr(local_store, "_USER_NOTIFICATIONS", {})
    monkeypatch.setattr(
        air_alerts.supabase_client, "get_notification_preferences", lambda _: prefs
    )
    rows = [
        station("low", pm25=10),
        station("warning"),
        station("danger", pm25=80),
        station("far", lat=14.03),
        station("expired", source_at=(now - timedelta(hours=2)).isoformat()),
    ]
    monkeypatch.setattr(air_alerts, "candidates", lambda *_: rows)
    return point, prefs, rows


def test_all_alerting_pins_in_two_km_even_when_nearest_pin_is_low(environment):
    _, _, rows = environment
    assert air_alerts.evaluate("recipient") == 2
    notices = local_store.list_user_notifications("recipient", 100)
    assert {n["payload"]["source_id"] for n in notices} == {"warning", "danger"}
    assert all(n["payload"]["policy_version"] == POLICY_VERSION for n in notices)
    assert air_alerts.evaluate("recipient") == 0
    # No per-user pending slot: many same-band observations queue in one pass.
    rows.extend(station(f"extra-{i}") for i in range(20))
    assert air_alerts.evaluate("recipient") == 20


def test_same_pin_new_reading_same_band_and_lower_band_still_notify(environment):
    _, _, rows = environment
    assert air_alerts.evaluate("recipient") == 2
    rows[1] = {
        **rows[1],
        "source_at": (datetime.now(UTC) - timedelta(minutes=1)).isoformat(),
    }
    rows[2] = {**rows[2], "pm25": 45}
    assert air_alerts.evaluate("recipient") == 2
    air_alerts.STATES.clear()
    assert air_alerts.evaluate("recipient") == 0


def test_gps_updates_and_concurrent_evaluators_do_not_duplicate(environment):
    point, _, _ = environment
    with ThreadPoolExecutor(max_workers=8) as pool:
        assert sum(pool.map(air_alerts.evaluate, ["recipient"] * 8)) == 2
    point["version"] = "v2"
    assert air_alerts.evaluate("recipient") == 0
    assert len(local_store.list_user_notifications("recipient", 100)) == 2


def test_every_recipient_gets_distinct_delivery_keys(environment):
    assert air_alerts.evaluate("recipient") == 2
    assert air_alerts.evaluate("other-recipient") == 2
    one = {
        n["deduplication_key"]
        for n in local_store.list_user_notifications("recipient", 100)
    }
    two = {
        n["deduplication_key"]
        for n in local_store.list_user_notifications("other-recipient", 100)
    }
    assert one.isdisjoint(two)


def test_band_opt_out_consent_and_expired_gps_are_respected(environment):
    point, prefs, _ = environment
    prefs["air_alert_warning"] = False
    assert air_alerts.evaluate("recipient") == 1
    prefs["air_alert_warning"] = True
    assert air_alerts.evaluate("recipient") == 1
    prefs["consent_granted"] = False
    assert air_alerts.evaluate("recipient") == 0
    prefs["consent_granted"] = True
    point["observed_at"] = (datetime.now(UTC) - timedelta(days=2)).isoformat()
    assert air_alerts.evaluate("recipient") == 0


def test_delivery_rechecks_specific_pin_not_nearest_and_survives_midnight(environment):
    point, prefs, rows = environment
    source = alert_sources(point, rows, prefs, datetime.now(UTC))[1]
    payload = air_alerts.notice_for(source, point, prefs, "key")["payload"]
    payload["alert_day"] = "2000-01-01"
    assert air_alerts.delivery_allowed("recipient", payload)
    rows.remove(next(r for r in rows if r["source_id"] == source["source_id"]))
    assert not air_alerts.delivery_allowed("recipient", payload)
    assert not air_alerts.delivery_allowed(
        "recipient", {**payload, "policy_version": "nearest-pin-daily-v2"}
    )


def test_observation_identity_is_timezone_and_number_normalized():
    source = station(source_at="2026-11-27T01:00:00Z", pm25=50)
    assert observation_key(source) == observation_key(
        {**source, "source_at": "2026-11-27T08:00:00+07:00", "pm25": 50.0}
    )
    assert observation_key(source) != observation_key(
        {**source, "source_at": "2026-11-27T01:01:00Z"}
    )
    assert observation_key(source) != observation_key({**source, "pm25": 51})
