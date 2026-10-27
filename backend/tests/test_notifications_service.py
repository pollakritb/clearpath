from __future__ import annotations

import pytest

from backend.services import notifications


def test_enqueue_respects_preferences_and_persists_idempotent_outbox(monkeypatch):
    monkeypatch.setattr(
        notifications.supabase_client,
        "get_notification_preferences",
        lambda _user_id: {"rating_alerts": False},
    )
    assert (
        notifications.enqueue_user_notification(
            user_id="user-1",
            event_type="rating",
            title="title",
            body="body",
            deduplication_key="rating:1",
        )
        == {}
    )

    rows: list[dict] = []
    outbox: list[dict] = []
    monkeypatch.setattr(
        notifications.supabase_client,
        "get_notification_preferences",
        lambda _user_id: {"consent_granted": True},
    )
    monkeypatch.setattr(
        notifications.supabase_client,
        "create_user_notification",
        lambda row: rows.append(row) or row,
    )
    monkeypatch.setattr(
        notifications.supabase_client,
        "create_outbox_event",
        lambda row: outbox.append(row) or row,
    )
    result = notifications.enqueue_user_notification(
        user_id="user-1",
        event_type="announcement",
        title="title",
        body="body",
        deduplication_key="announcement:1",
        payload={"kind": "news"},
    )
    assert result["user_id"] == "user-1"
    assert rows[0]["payload"] == {"kind": "news"}
    assert {row["event_key"] for row in outbox} == {
        "announcement:1:line",
    }
    assert all(row["status"] == "pending" for row in outbox)


def test_outbox_marks_success_and_schedules_bounded_retry(monkeypatch):
    events = [
        {"id": "ok", "user_id": "user-1", "payload": {}, "attempts": 0},
        {"id": "fail", "user_id": "user-2", "payload": {}, "attempts": 8},
    ]
    updates: list[tuple[str, dict]] = []
    monkeypatch.setattr(
        notifications.supabase_client, "list_pending_outbox", lambda _limit: events
    )
    monkeypatch.setattr(
        notifications.supabase_client,
        "update_outbox_event",
        lambda event_id, values: updates.append((event_id, values)),
    )

    def deliver(user_id: str, _payload: dict):
        if user_id == "user-2":
            raise RuntimeError("temporary provider failure")
        return 2

    monkeypatch.setattr(notifications, "deliver_to_user", deliver)
    assert notifications.process_outbox() == {
        "processed": 2,
        "delivered": 2,
        "failed": 1,
        "deferred": 0,
        "dead": 1,
    }
    assert updates[0][1]["status"] == "sent"
    assert updates[0][1]["payload"] == {"channel": None, "tag": None}
    assert updates[1][1]["status"] == "dead"
    assert updates[1][1]["attempts"] == 9
    assert updates[1][1]["last_error"] == "notification_provider_error"
    assert updates[1][1]["payload"] == {"channel": None, "tag": None}


def test_channel_preferences_quiet_hours_and_consent(monkeypatch):
    monkeypatch.setattr(notifications.line_messaging, "send_to_user", lambda *_args: 1)

    monkeypatch.setattr(
        notifications.supabase_client,
        "get_notification_preferences",
        lambda _user_id: {
            "consent_granted": True,
            "web_push_enabled": False,
            "line_enabled": True,
        },
    )
    assert notifications.deliver_to_user("user-1", {}) == 1

    monkeypatch.setattr(
        notifications.supabase_client,
        "get_notification_preferences",
        lambda _user_id: {"consent_granted": False},
    )
    assert notifications.deliver_to_user("user-1", {}) == 0

    monkeypatch.setattr(notifications, "is_quiet_hour", lambda *_args: True)
    monkeypatch.setattr(
        notifications.supabase_client,
        "get_notification_preferences",
        lambda _user_id: {"consent_granted": True},
    )
    with pytest.raises(notifications.NotificationDeferred):
        notifications.deliver_to_user("user-1", {})


def test_retired_push_jobs_never_send(monkeypatch):
    monkeypatch.setattr(
        notifications.supabase_client,
        "get_notification_preferences",
        lambda _user_id: {"consent_granted": True, "web_push_enabled": True},
    )
    assert notifications.deliver_to_channel("user-1", {}, "web_push", force=True) == 0


def test_line_delivery_still_works(monkeypatch):
    monkeypatch.setattr(
        notifications.supabase_client,
        "get_notification_preferences",
        lambda _user_id: {"consent_granted": True},
    )
    monkeypatch.setattr(notifications.line_messaging, "send_to_user", lambda *_args: 1)
    assert notifications.deliver_to_user("user-1", {}) == 1


def test_outbox_defers_without_consuming_attempt(monkeypatch):
    updates: list[tuple[str, dict]] = []
    monkeypatch.setattr(
        notifications.supabase_client,
        "list_pending_outbox",
        lambda _limit: [{"id": "quiet", "user_id": "u", "payload": {}, "attempts": 3}],
    )
    monkeypatch.setattr(
        notifications.supabase_client,
        "update_outbox_event",
        lambda event_id, values: updates.append((event_id, values)),
    )
    monkeypatch.setattr(
        notifications,
        "deliver_to_user",
        lambda *_args: (_ for _ in ()).throw(notifications.NotificationDeferred()),
    )
    result = notifications.process_outbox()
    assert result == {
        "processed": 1,
        "delivered": 0,
        "failed": 0,
        "deferred": 1,
        "dead": 0,
    }
    assert updates[0][1]["status"] == "pending"
    assert "attempts" not in updates[0][1]


def test_publish_alert_deduplicates_event_and_recipient_list(monkeypatch):
    monkeypatch.setattr(
        notifications.supabase_client, "create_alert_if_new", lambda _row: None
    )
    assert (
        notifications.publish_alert(
            deduplication_key="alert-1",
            source="air4thai",
            kind="pm25_threshold",
            severity="watch",
            title="title",
            body="body",
            detected_at="2026-09-16T00:00:00Z",
            recipients=["user-1"],
        )
        is None
    )

    updates: list[dict] = []
    queued: list[str] = []
    audits: list[dict] = []
    monkeypatch.setattr(
        notifications.supabase_client,
        "create_alert_if_new",
        lambda row: {**row, "id": "event-1"},
    )
    monkeypatch.setattr(
        notifications.supabase_client,
        "update_alert_event",
        lambda _event_id, values: updates.append(values),
    )
    monkeypatch.setattr(
        notifications,
        "enqueue_user_notification",
        lambda **kwargs: queued.append(kwargs["user_id"]) or {"id": "notification"},
    )
    monkeypatch.setattr(
        notifications.supabase_client,
        "create_audit_log",
        lambda row: audits.append(row) or row,
    )
    result = notifications.publish_alert(
        deduplication_key="hotspot-1",
        source="nasa_firms",
        kind="satellite_hotspot",
        severity="warning",
        title="title",
        body="body",
        detected_at="2026-09-16T00:00:00Z",
        recipients=["user-1", "user-1", "user-2"],
        payload={"frp": 25},
    )
    assert result and result["recipient_count"] == 2
    assert set(queued) == {"user-1", "user-2"}
    assert updates[0]["recipient_count"] == 2
    assert audits == [
        {
            "actor_id": None,
            "action": "alert_event_created",
            "entity_type": "alert_event",
            "entity_id": "event-1",
            "details": {
                "source": "nasa_firms",
                "kind": "satellite_hotspot",
                "severity": "warning",
                "detected_at": "2026-09-16T00:00:00Z",
                "recipient_count": 2,
            },
        }
    ]
