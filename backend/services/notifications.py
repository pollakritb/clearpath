"""PWA Web Push delivery and alert-event deduplication."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from pywebpush import WebPushException, webpush

from ..algorithms.notification_policy import is_quiet_hour
from ..core.config import settings
from ..core.errors import ConfigurationError, UpstreamError
from . import line_messaging, supabase_client

MAX_OUTBOX_ATTEMPTS = 8


class NotificationDeferred(Exception):
    """A delivery that must remain queued until its quiet window ends."""


def send_to_subscription(subscription: dict, payload: dict) -> bool:
    if not settings.web_push_ready:
        raise ConfigurationError("Web Push ยังไม่เปิดใช้งาน")
    if not settings.vapid_private_key or not settings.vapid_subject:
        raise ConfigurationError("ยังไม่ได้ตั้งค่า VAPID_PRIVATE_KEY/VAPID_SUBJECT")
    try:
        webpush(
            subscription_info={
                "endpoint": subscription["endpoint"],
                "keys": {
                    "p256dh": subscription["p256dh"],
                    "auth": subscription["auth_secret"],
                },
            },
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_subject},
            ttl=3600,
        )
        return True
    except WebPushException as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        if status in {404, 410}:
            supabase_client.deactivate_push_subscription(subscription["endpoint"])
            return False
        raise UpstreamError("Web Push provider ส่งข้อความไม่สำเร็จ") from exc
    except (KeyError, TypeError, ValueError):
        # A malformed or obsolete subscription must not abort alerts for
        # every other recipient in the scheduled batch.
        supabase_client.deactivate_push_subscription(
            str(subscription.get("endpoint") or "")
        )
        return False


def send_to_user(user_id: str, payload: dict) -> int:
    delivered = 0
    provider_failed = False
    for subscription in supabase_client.list_push_subscriptions(user_id):
        try:
            delivered += int(send_to_subscription(subscription, payload))
        except UpstreamError:
            provider_failed = True
    if provider_failed and delivered == 0:
        raise UpstreamError("Web Push provider ส่งข้อความไม่สำเร็จ")
    return delivered


def _delivery_preferences(user_id: str) -> dict:
    return supabase_client.get_notification_preferences(user_id) or {}


def _enforce_delivery_policy(preferences: dict, *, force: bool = False) -> bool:
    if force:
        return True
    if preferences.get("consent_granted") is not True:
        return False
    if is_quiet_hour(
        datetime.now(UTC),
        preferences.get("quiet_hours_start"),
        preferences.get("quiet_hours_end"),
        str(preferences.get("timezone") or "Asia/Bangkok"),
    ):
        raise NotificationDeferred("quiet_hours")
    return True


def deliver_to_channel(
    user_id: str, payload: dict, channel: str, *, force: bool = False
) -> int:
    """Deliver one independently retryable channel for a user."""
    preferences = _delivery_preferences(user_id)
    if not _enforce_delivery_policy(preferences, force=force):
        return 0
    if channel == "web_push":
        if preferences.get("web_push_enabled", True) is False:
            return 0
        return send_to_user(user_id, payload) if settings.web_push_ready else 0
    if channel == "line":
        if preferences.get("line_enabled", True) is False:
            return 0
        return line_messaging.send_to_user(user_id, payload)
    raise ValueError("unsupported notification channel")


def deliver_to_user(user_id: str, payload: dict, *, force: bool = False) -> int:
    """Deliver through linked channels without one provider blocking another."""
    delivered = 0
    provider_failed = False
    for channel in ("web_push", "line"):
        try:
            delivered += deliver_to_channel(user_id, payload, channel, force=force)
        except NotificationDeferred:
            raise
        except (ConfigurationError, UpstreamError):
            provider_failed = True
    if provider_failed and delivered == 0:
        raise UpstreamError("ผู้ให้บริการแจ้งเตือนไม่พร้อมใช้งาน")
    return delivered


def enqueue_user_notification(
    *,
    user_id: str,
    event_type: str,
    title: str,
    body: str,
    deduplication_key: str,
    url: str = "/",
    entity_type: str | None = None,
    entity_id: str | None = None,
    payload: dict | None = None,
) -> dict:
    """Persist the in-app item first, then enqueue idempotent Web Push delivery."""
    preference_key = {
        "report_status": "report_status_alerts",
        "rating": "rating_alerts",
        "reward": "reward_alerts",
        "leaderboard": "leaderboard_alerts",
        "announcement": "announcement_alerts",
        "air_alert": "air_alerts",
        "hotspot": "hotspot_alerts",
    }.get(event_type)
    preferences = supabase_client.get_notification_preferences(user_id) or {}
    if preference_key and preferences.get(preference_key, True) is False:
        return {}
    now = datetime.now(UTC).isoformat()
    notification = supabase_client.create_user_notification(
        {
            "id": str(uuid4()),
            "user_id": user_id,
            "event_type": event_type,
            "title": title,
            "body": body,
            "url": url,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "payload": payload or {},
            "deduplication_key": deduplication_key,
            "read_at": None,
            "created_at": now,
        }
    )
    channels = []
    if preferences.get("consent_granted") is True:
        if preferences.get("web_push_enabled", True):
            channels.append("web_push")
        if preferences.get("line_enabled", True):
            channels.append("line")
    for channel in channels:
        supabase_client.create_outbox_event(
            {
                "id": str(uuid4()),
                "user_id": user_id,
                "notification_id": notification.get("id"),
                "event_key": f"{deduplication_key}:{channel}",
                "payload": {
                    "channel": channel,
                    "title": title,
                    "body": body,
                    "url": url,
                    "tag": deduplication_key,
                },
                "status": "pending",
                "attempts": 0,
                "next_attempt_at": now,
                "created_at": now,
            }
        )
    return notification


def process_outbox(limit: int = 100) -> dict:
    processed = delivered = failed = deferred = dead = 0
    for event in supabase_client.list_pending_outbox(min(max(limit, 1), 100)):
        processed += 1
        attempts = int(event.get("attempts") or 0) + 1
        try:
            payload = dict(event.get("payload") or {})
            channel = payload.pop("channel", None)
            count = (
                deliver_to_channel(str(event["user_id"]), payload, str(channel))
                if channel
                else deliver_to_user(str(event["user_id"]), payload)
            )
            delivered += count
            supabase_client.update_outbox_event(
                str(event["id"]),
                {
                    "status": "sent",
                    "attempts": attempts,
                    "processed_at": datetime.now(UTC).isoformat(),
                    "last_error": None,
                    "payload": {
                        "channel": channel,
                        "tag": payload.get("tag"),
                    },
                },
            )
        except NotificationDeferred:
            deferred += 1
            supabase_client.update_outbox_event(
                str(event["id"]),
                {
                    "status": "pending",
                    "next_attempt_at": (
                        datetime.now(UTC) + timedelta(minutes=30)
                    ).isoformat(),
                    "last_error": None,
                },
            )
        except Exception:
            failed += 1
            delay_minutes = min(60, 2 ** min(attempts, 5))
            terminal = attempts >= MAX_OUTBOX_ATTEMPTS
            dead += int(terminal)
            supabase_client.update_outbox_event(
                str(event["id"]),
                {
                    "status": "dead" if terminal else "failed",
                    "attempts": attempts,
                    "next_attempt_at": (
                        datetime.now(UTC) + timedelta(minutes=delay_minutes)
                    ).isoformat(),
                    "last_error": "notification_provider_error",
                    **(
                        {
                            "payload": {
                                "channel": channel,
                                "tag": payload.get("tag"),
                            }
                        }
                        if terminal
                        else {}
                    ),
                },
            )
    return {
        "processed": processed,
        "delivered": delivered,
        "failed": failed,
        "deferred": deferred,
        "dead": dead,
    }


def publish_alert(
    *,
    deduplication_key: str,
    source: str,
    kind: str,
    severity: str,
    title: str,
    body: str,
    detected_at: str,
    recipients: list[str],
    lat: float | None = None,
    lon: float | None = None,
    payload: dict | None = None,
) -> dict | None:
    row = {
        "id": str(uuid4()),
        "deduplication_key": deduplication_key,
        "source": source,
        "kind": kind,
        "severity": severity,
        "title": title,
        "body": body,
        "detected_at": detected_at,
        "lat": lat,
        "lon": lon,
        "payload": payload or {},
    }
    event = supabase_client.create_alert_if_new(row)
    if not event:
        return None
    delivered = 0
    event_type = "hotspot" if "hotspot" in kind else "air_alert"
    for user_id in set(recipients):
        queued = enqueue_user_notification(
            user_id=user_id,
            event_type=event_type,
            title=title,
            body=body,
            url="/",
            entity_type="alert_event",
            entity_id=str(event["id"]),
            deduplication_key=f"alert:{deduplication_key}:{user_id}",
            payload={"kind": kind, "severity": severity, **(payload or {})},
        )
        delivered += int(bool(queued))
    supabase_client.update_alert_event(
        str(event["id"]),
        {
            "sent_at": datetime.now(UTC).isoformat(),
            "recipient_count": delivered,
        },
    )
    supabase_client.create_audit_log(
        {
            "actor_id": None,
            "action": "alert_event_created",
            "entity_type": "alert_event",
            "entity_id": str(event["id"]),
            "details": {
                "source": source,
                "kind": kind,
                "severity": severity,
                "detected_at": detected_at,
                "recipient_count": delivered,
            },
        }
    )
    return {**event, "recipient_count": delivered}
