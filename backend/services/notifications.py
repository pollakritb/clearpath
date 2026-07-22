"""PWA Web Push delivery and alert-event deduplication."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from uuid import uuid4

from pywebpush import WebPushException, webpush

from ..core.config import settings
from ..core.errors import ConfigurationError
from . import supabase_client


def send_to_subscription(subscription: dict, payload: dict) -> bool:
    if not settings.push_enabled:
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
    except (KeyError, TypeError, ValueError):
        # A malformed or obsolete subscription must not abort alerts for
        # every other recipient in the scheduled batch.
        supabase_client.deactivate_push_subscription(
            str(subscription.get("endpoint") or "")
        )
        return False


def send_to_user(user_id: str, payload: dict) -> int:
    delivered = 0
    for subscription in supabase_client.list_push_subscriptions(user_id):
        delivered += int(send_to_subscription(subscription, payload))
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
    supabase_client.create_outbox_event(
        {
            "id": str(uuid4()),
            "user_id": user_id,
            "notification_id": notification.get("id"),
            "event_key": deduplication_key,
            "payload": {
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
    processed = delivered = failed = 0
    for event in supabase_client.list_pending_outbox(limit):
        processed += 1
        attempts = int(event.get("attempts") or 0) + 1
        try:
            count = (
                send_to_user(str(event["user_id"]), dict(event.get("payload") or {}))
                if settings.push_enabled
                else 0
            )
            delivered += count
            supabase_client.update_outbox_event(
                str(event["id"]),
                {
                    "status": "sent",
                    "attempts": attempts,
                    "processed_at": datetime.now(UTC).isoformat(),
                    "last_error": None,
                },
            )
        except Exception as exc:
            failed += 1
            delay_minutes = min(60, 2 ** min(attempts, 5))
            from datetime import timedelta

            supabase_client.update_outbox_event(
                str(event["id"]),
                {
                    "status": "failed",
                    "attempts": attempts,
                    "next_attempt_at": (
                        datetime.now(UTC) + timedelta(minutes=delay_minutes)
                    ).isoformat(),
                    "last_error": str(exc)[:500],
                },
            )
    return {"processed": processed, "delivered": delivered, "failed": failed}


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
    return {**event, "recipient_count": delivered}
