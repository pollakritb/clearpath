"""LINE delivery and alert-event deduplication."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from time import monotonic

from ..algorithms.line_notification_policy import (
    LINE_EVENT_TYPES,
    line_event_type,
    line_retry_key,
)
from ..algorithms.notification_policy import is_quiet_hour
from ..core.config import settings
from ..core.errors import ConfigurationError, UpstreamError
from . import line_messaging, supabase_client
from .record_keys import creation_key

MAX_OUTBOX_ATTEMPTS = 8


class NotificationDeferred(Exception):
    """A delivery that must remain queued until its quiet window ends."""


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
    if channel == "line" and preferences.get("line_enabled", True) is False:
        return 0
    if not _enforce_delivery_policy(preferences, force=force):
        return 0
    # Retired push jobs may still exist in the historical outbox.
    if channel == "web_push":
        return 0
    if channel == "line":
        return line_messaging.send_to_user(user_id, payload)
    raise ValueError("unsupported notification channel")


def deliver_to_user(user_id: str, payload: dict, *, force: bool = False) -> int:
    """Deliver through linked channels without one provider blocking another."""
    delivered = 0
    provider_failed = False
    for channel in ("line",):
        try:
            delivered += deliver_to_channel(user_id, payload, channel, force=force)
        except NotificationDeferred:
            raise
        except (ConfigurationError, UpstreamError):
            provider_failed = True
    if provider_failed and delivered == 0:
        raise UpstreamError("ผู้ให้บริการแจ้งเตือนไม่พร้อมใช้งาน")
    return delivered


def inbox(user_id: str, limit: int = 50) -> list[dict]:
    rows = supabase_client.list_user_notifications(user_id, 100)
    result: list[dict] = []
    seen: dict[tuple[str, str], dict] = {}
    for source in rows:
        row = dict(source)
        if row.get("event_type") == "report_status" and row.get("entity_id"):
            report_id = str(row["entity_id"])
            key = (report_id, str((row.get("payload") or {}).get("status")))
            if key in seen:
                # Reading either representation means the event has been read.
                seen[key]["read_at"] = seen[key].get("read_at") or row.get("read_at")
                continue
            row["url"] = (
                "/report"
                if (row.get("payload") or {}).get("status") == "rejected"
                else f"/?report={report_id}"
            )
            seen[key] = row
        result.append(row)
    return result[:limit]


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
    """Persist the in-app item first, then enqueue idempotent LINE delivery."""
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
    if settings.line_durable_delivery_enabled and not settings.local_demo_mode:
        from . import store_client

        notice = {
            "event_type": event_type,
            "title": title,
            "body": body,
            "url": url,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "payload": payload or {},
            "deduplication_key": deduplication_key,
        }
        outbox = None
        if (
            event_type in LINE_EVENT_TYPES
            and preferences.get("consent_granted") is True
            and preferences.get("line_enabled", True)
        ):
            outbox = {
                "event_key": f"{deduplication_key}:line",
                "payload": {
                    **(payload or {}),
                    "channel": "line",
                    "event_type": event_type,
                    "title": title,
                    "body": body,
                    "url": url,
                    "tag": deduplication_key,
                },
            }
        return (
            store_client.get_client()
            .rpc(
                "enqueue_notification",
                {"p_user": user_id, "p_notice": notice, "p_outbox": outbox},
            )
            .execute()
            .data
        )
    notification = supabase_client.create_user_notification(
        {
            "id": creation_key("user_notifications"),
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
    if (
        event_type in LINE_EVENT_TYPES
        and preferences.get("consent_granted") is True
        and preferences.get("line_enabled", True)
    ):
        channels.append("line")
    for channel in channels:
        supabase_client.create_outbox_event(
            {
                "id": creation_key("notification_outbox"),
                "user_id": user_id,
                "notification_id": notification.get("id"),
                "event_key": f"{deduplication_key}:{channel}",
                "payload": {
                    "channel": channel,
                    "event_type": event_type,
                    **(
                        {
                            k: (payload or {}).get(k)
                            for k in (
                                "source_at",
                                "pm25",
                                "lat",
                                "lon",
                                "source_type",
                                "source_id",
                                "policy_version",
                                "location_version",
                                "preferences_at",
                            )
                        }
                        if event_type == "air_alert"
                        else {}
                    ),
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


def _air_delivery_allowed(user_id: str, payload: dict) -> bool:
    from .air_alerts import delivery_allowed

    return delivery_allowed(user_id, payload)


def process_outbox(limit: int = 100, budget_seconds: float | None = 20) -> dict:
    if settings.line_durable_delivery_enabled and not settings.local_demo_mode:
        from .line_delivery import process_outbox as consume

        return consume(min(limit, 1))
    from .community import xp

    if xp.configured():
        try:
            paused = xp.control()["maintenance"]
        except Exception:
            paused = True
        if paused:
            return {
                "processed": 0,
                "delivered": 0,
                "failed": 0,
                "deferred": 0,
                "dead": 0,
                "paused": True,
            }
    processed = delivered = failed = deferred = dead = 0
    deadline = (
        monotonic() + budget_seconds if budget_seconds is not None else float("inf")
    )
    for event in supabase_client.list_pending_outbox(min(max(limit, 1), 100)):
        if monotonic() >= deadline:
            break
        processed += 1
        attempts = int(event.get("attempts") or 0) + 1
        channel = None
        payload = {}
        try:
            payload = dict(event.get("payload") or {})
            channel = payload.pop("channel", None)
            from .measurement import store as measurement_store

            if not measurement_store.claim_delivery(str(event["id"])):
                continue
            event_type = line_event_type(payload)
            reason = None
            if channel not in (None, "line") or event_type not in LINE_EVENT_TYPES:
                reason = "line_event_disabled"
            elif (
                event_type == "measurement_request"
                and not (
                    payload.get("measurement_group_id")
                    or (
                        payload.get("measurement_request_id")
                        and payload.get("measurement_kind") == event_type
                    )
                )
                or event_type == "measurement_fulfilled"
                and not (
                    payload.get("measurement_request_id")
                    and payload.get("measurement_kind") == event_type
                    and not payload.get("measurement_group_id")
                )
            ):
                reason = "measurement_context_missing"
            elif event_type == "air_alert" and not _air_delivery_allowed(
                str(event["user_id"]), payload
            ):
                reason = "air_alert_no_longer_eligible"
            if reason:
                dead += 1
                supabase_client.update_outbox_event(
                    str(event["id"]),
                    {
                        "status": "dead",
                        "processed_at": datetime.now(UTC).isoformat(),
                        "last_error": reason,
                        "payload": {"channel": channel, "tag": payload.get("tag")},
                    },
                )
                continue
            payload["event_type"] = event_type
            payload["retry_key"] = line_retry_key(
                str(event["id"]), payload.get("retry_key")
            )
            if payload.get("measurement_group_id"):
                from .measurement import registered
                from .measurement import store as measurement_store

                current = registered.prepare_group(
                    str(payload["measurement_group_id"]), str(event["user_id"])
                )
                preferences = _delivery_preferences(str(event["user_id"]))
                if (
                    not current
                    or not preferences.get("consent_granted")
                    or not preferences.get("line_enabled", True)
                ):
                    dead += 1
                    supabase_client.update_outbox_event(
                        str(event["id"]),
                        {
                            "status": "dead",
                            "last_error": "measurement_request_closed_or_opted_out",
                            "payload": {"tag": payload.get("tag")},
                        },
                    )
                    continue
                payload.update({key: current[key] for key in ("title", "body", "url")})
            if payload.get("measurement_request_id"):
                from .measurement import (
                    service as measurement_service,
                )
                from .measurement import (
                    store as measurement_store,
                )

                if not measurement_service.delivery_allowed(
                    str(event["user_id"]), payload
                ):
                    dead += 1
                    supabase_client.update_outbox_event(
                        str(event["id"]),
                        {
                            "status": "dead",
                            "last_error": "measurement_request_closed_or_opted_out",
                            "payload": {"tag": payload.get("tag")},
                        },
                    )
                    continue
            count = (
                deliver_to_channel(str(event["user_id"]), payload, str(channel))
                if channel
                else deliver_to_user(str(event["user_id"]), payload)
            )
            delivered += count
            supabase_client.update_outbox_event(
                str(event["id"]),
                {
                    "status": "sent" if count > 0 else "dead",
                    "attempts": attempts,
                    "processed_at": datetime.now(UTC).isoformat(),
                    "last_error": None if count > 0 else "notification_not_delivered",
                    "payload": {
                        "channel": channel,
                        "tag": payload.get("tag"),
                    },
                },
            )
            if count <= 0:
                dead += 1
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
        "id": creation_key("alert_events"),
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
            payload={
                "kind": kind,
                "severity": severity,
                **(payload or {}),
                "source_at": detected_at,
                "lat": lat,
                "lon": lon,
            },
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
