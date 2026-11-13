"""Offline end-to-end outbox checks: no external messages are sent."""

from copy import deepcopy
from datetime import UTC, datetime, timedelta
from uuid import UUID

import httpx
import pytest

from backend.algorithms.nearest_air_alert import nearest_source
from backend.core.config import settings
from backend.core.errors import UpstreamError
from backend.services import air_alerts, line_messaging, notifications
from backend.services.community import xp
from backend.services.measurement import store

REAL_CLAIM = store.claim_delivery


def event(kind="air_alert"):
    return {
        "id": "test-policy-1",
        "user_id": "test-user",
        "attempts": 0,
        "payload": {
            "channel": "line",
            "policy_version": "nearest-pin-v1",
            "location_version": "v1",
            "preferences_at": "p1",
            "source_type": "station",
            "source_id": "test",
            "event_type": kind,
            "tag": "alert:pm25:test",
            "source_at": (datetime.now(UTC) - timedelta(minutes=10)).isoformat(),
            "pm25": 40,
            "lat": 13.7,
            "lon": 100.5,
            "title": "test",
            "body": "test",
        },
    }


@pytest.fixture
def env(monkeypatch):
    preferences = {
        "updated_at": "p1",
        "consent_granted": True,
        "line_enabled": True,
        "air_alerts": True,
        "center_lat": 13.7,
        "center_lon": 100.5,
        "radius_km": 2,
        "quiet_hours_start": None,
        "quiet_hours_end": None,
    }
    rows = []

    def selected(_):
        now = datetime.now(UTC)
        point = {
            "lat": preferences.get("center_lat"),
            "lon": preferences.get("center_lon"),
            "accuracy_m": 10,
            "observed_at": now.isoformat(),
            "version": "v1",
        }
        picked = nearest_source(
            point, [rows[0]["payload"]] if rows else [], preferences["radius_km"], now
        )
        return preferences, point, picked

    monkeypatch.setattr(air_alerts, "selected", selected)
    updates = []
    sends = []
    monkeypatch.setattr(xp, "configured", lambda: False)
    monkeypatch.setattr(store, "claim_delivery", lambda _: True)
    monkeypatch.setattr(
        notifications.supabase_client,
        "get_notification_preferences",
        lambda _: preferences,
    )
    monkeypatch.setattr(
        notifications.supabase_client, "list_pending_outbox", lambda _: rows
    )
    monkeypatch.setattr(
        notifications.supabase_client,
        "update_outbox_event",
        lambda key, values: updates.append((key, values)),
    )
    monkeypatch.setattr(
        line_messaging,
        "send_to_user",
        lambda user, payload: sends.append(deepcopy(payload)) or 1,
    )
    return rows, updates, sends, preferences


@pytest.mark.parametrize(
    "kind",
    [
        "report_status",
        "measurement_expired",
        "hotspot",
        "rank_up",
        "rating",
        "reward",
        "leaderboard",
        "announcement",
        "unknown",
    ],
)
def test_removed_or_unknown_events_never_reach_line_even_when_already_queued(env, kind):
    rows, updates, sends, _ = env
    rows.append(event(kind))
    result = notifications.process_outbox()
    assert sends == []
    assert result["dead"] == 1 and result["delivered"] == 0
    assert updates[0][1]["status"] == "dead"
    assert updates[0][1]["last_error"] == "line_event_disabled"


def test_valid_air_message_gets_a_stable_uuid_retry_key(env):
    rows, updates, sends, _ = env
    rows.append(event())
    assert notifications.process_outbox()["delivered"] == 1
    assert updates[0][1]["status"] == "sent"
    assert UUID(sends[0]["retry_key"])
    notifications.process_outbox()
    assert sends[0]["retry_key"] == sends[1]["retry_key"]


@pytest.mark.parametrize("patch", [{"consent_granted": False}, {"line_enabled": False}])
def test_opted_out_events_are_terminal_but_never_marked_sent(env, patch):
    rows, updates, sends, prefs = env
    rows.append(event())
    prefs.update(patch)
    result = notifications.process_outbox()
    assert sends == [] and result["delivered"] == 0 and result["dead"] == 1
    assert updates[0][1]["status"] == "dead"
    assert updates[0][1]["last_error"] == (
        "air_alert_no_longer_eligible"
        if patch.get("consent_granted") is False
        else "notification_not_delivered"
    )


def test_missing_line_link_is_not_reported_as_sent(env, monkeypatch):
    rows, updates, sends, _ = env
    rows.append(event())
    monkeypatch.setattr(line_messaging, "send_to_user", lambda *_: 0)
    assert notifications.process_outbox()["dead"] == 1
    assert sends == [] and updates[0][1]["status"] == "dead"


@pytest.mark.parametrize(
    "patch", [{"air_alerts": False}, {"center_lat": None}, {"pm25_threshold": 100}]
)
def test_changes_to_air_preferences_cancel_old_pending_messages(env, patch):
    rows, updates, sends, prefs = env
    rows.append(event())
    prefs.update(patch)
    assert notifications.process_outbox()["dead"] == 1
    assert sends == [] and updates[0][1]["last_error"] == "air_alert_no_longer_eligible"


def test_quiet_hours_defer_without_consuming_an_attempt_then_expire_old_air(
    env, monkeypatch
):
    rows, updates, sends, _ = env
    rows.append(event())
    monkeypatch.setattr(notifications, "is_quiet_hour", lambda *_: True)
    assert notifications.process_outbox()["deferred"] == 1
    assert "attempts" not in updates[-1][1] and sends == []
    rows[0]["payload"]["source_at"] = (
        datetime.now(UTC) - timedelta(hours=10)
    ).isoformat()
    assert notifications.process_outbox()["dead"] == 1
    assert updates[-1][1]["last_error"] == "air_alert_no_longer_eligible"


def test_worker_that_cannot_claim_the_event_does_not_send(env, monkeypatch):
    rows, updates, sends, _ = env
    rows.append(event())
    monkeypatch.setattr(store, "claim_delivery", lambda _: False)
    assert notifications.process_outbox()["delivered"] == 0
    assert updates == [] and sends == []


def test_failed_provider_can_retry_with_the_same_key(env, monkeypatch):
    rows, updates, sends, _ = env
    rows.append(event())

    def fail(user, payload):
        sends.append(deepcopy(payload))
        raise UpstreamError("offline mock")

    monkeypatch.setattr(line_messaging, "send_to_user", fail)
    assert notifications.process_outbox()["failed"] == 1
    assert updates[-1][1]["status"] == "failed"
    key = sends[0]["retry_key"]
    rows[0]["attempts"] = updates[-1][1]["attempts"]
    monkeypatch.setattr(
        line_messaging,
        "send_to_user",
        lambda user, payload: sends.append(deepcopy(payload)) or 1,
    )
    assert notifications.process_outbox()["delivered"] == 1
    assert sends[-1]["retry_key"] == key


def test_time_budget_leaves_unprocessed_jobs_available(env):
    rows, updates, sends, _ = env
    rows.append(event())
    assert notifications.process_outbox(budget_seconds=0)["processed"] == 0
    assert updates == [] and sends == []


@pytest.mark.parametrize("kind", ["measurement_request", "measurement_fulfilled"])
def test_allowed_measurement_events_are_revalidated_before_send(env, monkeypatch, kind):
    from backend.services.measurement import service

    rows, updates, sends, _ = env
    row = event(kind)
    row["payload"].update(
        measurement_request_id="request",
        measurement_kind=kind,
        expires_at=(datetime.now(UTC) + timedelta(hours=1)).isoformat(),
    )
    rows.append(row)
    monkeypatch.setattr(service, "delivery_allowed", lambda *_: True)
    assert notifications.process_outbox()["delivered"] == 1
    assert sends[0]["event_type"] == kind and updates[-1][1]["status"] == "sent"


def test_closed_or_declined_measurement_request_does_not_send(env, monkeypatch):
    from backend.services.measurement import service

    rows, updates, sends, _ = env
    row = event("measurement_request")
    row["payload"].update(
        measurement_request_id="request", measurement_kind="measurement_request"
    )
    rows.append(row)
    monkeypatch.setattr(service, "delivery_allowed", lambda *_: False)
    assert notifications.process_outbox()["dead"] == 1
    assert sends == [] and updates[-1][1]["status"] == "dead"


def test_blocked_events_keep_the_inbox_but_do_not_create_line_outbox(env, monkeypatch):
    saved = []
    queued = []
    monkeypatch.setattr(
        notifications.supabase_client,
        "create_user_notification",
        lambda row: saved.append(row) or row,
    )
    monkeypatch.setattr(
        notifications.supabase_client,
        "create_outbox_event",
        lambda row: queued.append(row) or row,
    )
    for kind in ["report_status", "hotspot", "measurement_expired", "rank_up"]:
        notifications.enqueue_user_notification(
            user_id="u",
            event_type=kind,
            title="title",
            body="body",
            deduplication_key=kind,
        )
    assert len(saved) == 4 and queued == []


def test_non_acknowledged_409_is_a_failure_not_success(monkeypatch):
    monkeypatch.setattr(line_messaging, "_headers", lambda: {})
    monkeypatch.setattr(
        line_messaging.httpx,
        "post",
        lambda url, **_: httpx.Response(409, request=httpx.Request("POST", url)),
    )
    with pytest.raises(UpstreamError):
        line_messaging._post(line_messaging.LINE_PUSH_URL, {}, retry_key="test-key")


def test_line_opt_out_cancels_even_during_quiet_hours(env, monkeypatch):
    rows, updates, sends, prefs = env
    rows.append(event())
    prefs["line_enabled"] = False
    monkeypatch.setattr(notifications, "is_quiet_hour", lambda *_: True)
    result = notifications.process_outbox()
    assert result["dead"] == 1 and result["deferred"] == 0
    assert sends == [] and updates[-1][1]["status"] == "dead"


def test_two_workers_share_the_existing_delivery_lease(env, monkeypatch):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    rows, updates, sends, _ = env
    row = event()
    row["id"] = "line-concurrency-test"
    rows.append(row)
    monkeypatch.setattr(settings, "local_demo_mode", True)
    monkeypatch.setattr(store, "LEASES", {})
    # Use the real lease function saved before the fixture installs its stub.
    monkeypatch.setattr(store, "claim_delivery", REAL_CLAIM)
    barrier = Barrier(2)

    def pending(_):
        barrier.wait(timeout=5)
        return [deepcopy(row)]

    monkeypatch.setattr(notifications.supabase_client, "list_pending_outbox", pending)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: notifications.process_outbox(), range(2)))
    assert len(sends) == 1 and len(updates) == 1
    assert sum(result["delivered"] for result in results) == 1


def test_closed_group_is_cancelled_before_sending(env, monkeypatch):
    from backend.services.measurement import registered

    rows, updates, sends, _ = env
    row = event("measurement_request")
    row["payload"]["measurement_group_id"] = "group"
    rows.append(row)
    monkeypatch.setattr(registered, "prepare_group", lambda *_: None)
    assert notifications.process_outbox()["dead"] == 1
    assert sends == [] and updates[-1][1]["status"] == "dead"


@pytest.mark.parametrize(
    ("kind", "queued"),
    [
        ("measurement_request", True),
        ("measurement_fulfilled", True),
        ("measurement_expired", False),
    ],
)
def test_measurement_producer_queues_only_supported_line_events(
    env, monkeypatch, kind, queued
):
    from backend.services.measurement import registered, service

    persisted = []
    monkeypatch.setattr(registered, "enabled", lambda: False)
    monkeypatch.setattr(settings, "line_messaging_enabled", True)
    monkeypatch.setattr(settings, "line_channel_secret", "offline-test-secret")
    monkeypatch.setattr(settings, "line_channel_access_token", "offline-test-token")
    monkeypatch.setattr(line_messaging, "status", lambda _: {"linked": True})
    monkeypatch.setattr(service.db, "stable_identifier", lambda *_: "account")
    monkeypatch.setattr(
        store, "notify", lambda inbox, outbox: persisted.append((inbox, outbox))
    )
    service.notify(
        {
            "id": "request",
            "place_name": "พื้นที่ทดสอบ",
            "radius_km": 2,
            "expires_at": (datetime.now(UTC) + timedelta(minutes=30)).isoformat(),
        },
        "test-user",
        kind,
    )
    inbox, outbox = persisted[0]
    assert inbox["event_type"] == kind
    assert bool(outbox) is queued
    if queued:
        assert outbox["payload"]["event_type"] == kind
        assert outbox["payload"]["measurement_kind"] == kind
        assert outbox["payload"]["measurement_request_id"] == "request"
