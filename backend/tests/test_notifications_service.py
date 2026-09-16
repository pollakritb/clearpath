from __future__ import annotations

import json

import pytest

from backend.core.config import settings
from backend.core.errors import ConfigurationError
from backend.services import notifications


def _subscription(**overrides):
    return {
        "endpoint": "https://push.example/subscription",
        "p256dh": "public-key",
        "auth_secret": "auth-secret",
        **overrides,
    }


def _configure_web_push(monkeypatch, enabled: bool) -> None:
    monkeypatch.setattr(settings, "push_enabled", enabled)
    monkeypatch.setattr(settings, "vapid_public_key", "public-key" if enabled else "")
    monkeypatch.setattr(settings, "vapid_private_key", "private-key" if enabled else "")
    monkeypatch.setattr(
        settings, "vapid_subject", "mailto:admin@example.com" if enabled else ""
    )


def test_web_push_requires_complete_server_configuration(monkeypatch):
    _configure_web_push(monkeypatch, False)
    with pytest.raises(ConfigurationError):
        notifications.send_to_subscription(_subscription(), {"title": "test"})

    monkeypatch.setattr(settings, "push_enabled", True)
    monkeypatch.setattr(settings, "vapid_public_key", "public-key")
    monkeypatch.setattr(settings, "vapid_private_key", "")
    monkeypatch.setattr(settings, "vapid_subject", "")
    with pytest.raises(ConfigurationError):
        notifications.send_to_subscription(_subscription(), {"title": "test"})


def test_web_push_serializes_payload_without_leaking_server_key(monkeypatch):
    _configure_web_push(monkeypatch, True)
    captured: dict = {}
    monkeypatch.setattr(
        notifications, "webpush", lambda **kwargs: captured.update(kwargs)
    )

    assert notifications.send_to_subscription(_subscription(), {"title": "แจ้งเตือน"})
    assert captured["subscription_info"]["endpoint"].startswith("https://push")
    assert json.loads(captured["data"])["title"] == "แจ้งเตือน"
    assert captured["vapid_private_key"] == "private-key"
    assert captured["ttl"] == 3600


def test_web_push_deactivates_expired_and_malformed_subscriptions(monkeypatch):
    _configure_web_push(monkeypatch, True)
    deactivated: list[str] = []
    monkeypatch.setattr(
        notifications.supabase_client,
        "deactivate_push_subscription",
        deactivated.append,
    )

    class PushFailure(Exception):
        def __init__(self, status_code: int):
            self.response = type("Response", (), {"status_code": status_code})()

    monkeypatch.setattr(notifications, "WebPushException", PushFailure)
    monkeypatch.setattr(
        notifications,
        "webpush",
        lambda **_kwargs: (_ for _ in ()).throw(PushFailure(410)),
    )
    assert notifications.send_to_subscription(_subscription(), {}) is False
    assert deactivated == ["https://push.example/subscription"]

    monkeypatch.setattr(notifications, "webpush", lambda **_kwargs: None)
    assert notifications.send_to_subscription({"endpoint": "broken"}, {}) is False
    assert deactivated[-1] == "broken"

    monkeypatch.setattr(
        notifications,
        "webpush",
        lambda **_kwargs: (_ for _ in ()).throw(PushFailure(429)),
    )
    with pytest.raises(notifications.UpstreamError):
        notifications.send_to_subscription(_subscription(), {})
    assert deactivated == ["https://push.example/subscription", "broken"]


def test_user_delivery_combines_enabled_channels(monkeypatch):
    monkeypatch.setattr(
        notifications.supabase_client,
        "get_notification_preferences",
        lambda _user_id: {"consent_granted": True},
    )
    monkeypatch.setattr(
        notifications.supabase_client,
        "list_push_subscriptions",
        lambda _user_id: [_subscription(), _subscription(endpoint="second")],
    )
    monkeypatch.setattr(
        notifications,
        "send_to_subscription",
        lambda item, _payload: item["endpoint"] != "second",
    )
    assert notifications.send_to_user("user-1", {}) == 1

    _configure_web_push(monkeypatch, False)
    monkeypatch.setattr(notifications.line_messaging, "send_to_user", lambda *_args: 1)
    assert notifications.deliver_to_user("user-1", {}) == 1
    _configure_web_push(monkeypatch, True)
    assert notifications.deliver_to_user("user-1", {}) == 2


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
        "announcement:1:web_push",
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
    _configure_web_push(monkeypatch, True)
    monkeypatch.setattr(notifications, "send_to_user", lambda *_args: 1)
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


def test_partial_provider_failure_does_not_block_other_channel(monkeypatch):
    monkeypatch.setattr(
        notifications.supabase_client,
        "get_notification_preferences",
        lambda _user_id: {"consent_granted": True},
    )
    monkeypatch.setattr(settings, "push_enabled", True)
    monkeypatch.setattr(settings, "vapid_public_key", "public")
    monkeypatch.setattr(settings, "vapid_private_key", "private")
    monkeypatch.setattr(settings, "vapid_subject", "mailto:test@example.com")
    monkeypatch.setattr(
        notifications,
        "send_to_user",
        lambda *_args: (_ for _ in ()).throw(
            notifications.UpstreamError("web push unavailable")
        ),
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
