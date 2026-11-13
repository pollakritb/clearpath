"""Durable LINE inbox/outbox consumers. Safe to run in multiple processes."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from random import uniform

from ..algorithms.line_notification_policy import (
    LINE_EVENT_TYPES,
    line_event_type,
    line_retry_key,
)
from ..algorithms.line_security import (
    extract_link_code,
    hash_link_code,
    valid_line_signature,
)
from ..algorithms.nearest_air_alert import timestamp
from ..core.config import settings
from ..core.errors import ConfigurationError
from . import line_messaging, supabase_client
from . import store_client as db


def accept_webhook(body: bytes, signature: str) -> dict:
    if not settings.line_messaging_ready:
        raise ConfigurationError("LINE Messaging API ยังไม่เปิดใช้งาน")
    if len(body) > 1024 * 1024 or not valid_line_signature(
        body, signature, settings.line_channel_secret
    ):
        raise ValueError("ลายเซ็น LINE webhook ไม่ถูกต้อง")
    try:
        payload = json.loads(body)
        events = payload.get("events", [])
        if not isinstance(events, list) or any(
            not isinstance(e, dict)
            or not e.get("webhookEventId")
            or not isinstance(e.get("timestamp"), (int, float))
            for e in events
        ):
            raise ValueError()
    except (ValueError, AttributeError, TypeError) as exc:
        raise ValueError("LINE webhook JSON ไม่ถูกต้อง") from exc
    # One transaction for the entire request. No business logic or provider I/O.
    added = (
        db.get_client().rpc("accept_line_webhook", {"p_events": events}).execute().data
    )
    return {"accepted": int(added or 0)}


def process_inbox(limit: int = 10) -> dict:
    rows = (
        db.get_client().rpc("claim_line_webhooks", {"p_limit": limit}).execute().data
        or []
    )
    done = failed = 0
    for row in rows:
        try:
            event = dict(row["event"])
            # Reply tokens expire quickly. Never convert an expired reply into a push.
            if (datetime.now(UTC) - timestamp(row["event_at"])).total_seconds() > 45:
                event.pop("replyToken", None)
            # Signature was already verified before persistence; process only stored events.
            code = extract_link_code(
                str((event.get("message") or {}).get("text") or "")
            )
            reply = (
                db.get_client()
                .rpc(
                    "apply_line_webhook",
                    {
                        "p_event": row["event_id"],
                        "p_lease": row["lease_token"],
                        "p_code_hash": hash_link_code(
                            code, settings.line_channel_secret
                        )
                        if code
                        else None,
                    },
                )
                .execute()
                .data
            )
            reply_error = None
            if reply and event.get("replyToken"):
                # Replies are one-shot. Business changes are already committed;
                # an uncertain reply must never re-apply a link/unfollow event.
                try:
                    line_messaging._reply(event["replyToken"], reply)
                except line_messaging.LineProviderError as exc:
                    if exc.retryable:
                        raise
                    reply_error = exc.reason
            values = {
                "status": "done",
                "event": {},
                "reply_text": None,
                "last_error": reply_error,
            }
            done += 1
        except Exception:
            failed += 1
            values = {
                "last_error": "webhook_processing_error",
                "status": "dead" if row["attempts"] >= 8 else "pending",
                "available_at": (
                    datetime.now(UTC)
                    + timedelta(seconds=min(3600, 2 ** row["attempts"]) + uniform(0, 5))
                ).isoformat(),
            }
        db.get_client().table("line_webhook_inbox").update(
            {**values, "lease_until": None}
        ).eq("event_id", row["event_id"]).eq(
            "lease_token", row["lease_token"]
        ).execute()
    return {"processed": len(rows), "done": done, "failed": failed}


def _eligible(user_id: str, payload: dict) -> bool:
    from . import air_alerts
    from .measurement import registered, service

    kind = line_event_type(payload)
    if kind not in LINE_EVENT_TYPES:
        return False
    if kind == "air_alert":
        return air_alerts.delivery_allowed(user_id, payload)
    if payload.get("measurement_group_id") and kind == "measurement_request":
        return bool(
            registered.prepare_group(str(payload["measurement_group_id"]), user_id)
        )
    return bool(
        payload.get("measurement_request_id")
        and payload.get("measurement_kind") == kind
        and service.delivery_allowed(user_id, payload)
    )


def process_outbox(limit: int = 10) -> dict:
    from . import notifications
    from .community import xp

    if xp.configured() and xp.control()["maintenance"]:
        return {"paused": True, "processed": 0}
    rows = (
        db.get_client().rpc("claim_line_outbox", {"p_limit": limit}).execute().data
        or []
    )
    accepted = failed = suppressed = 0
    for row in rows:
        values = {}
        try:
            user = str(row["user_id"])
            payload = dict(row["payload"])
            prefs = notifications._delivery_preferences(user)
            if (
                not prefs.get("line_enabled", True)
                or not notifications._enforce_delivery_policy(prefs)
                or not _eligible(user, payload)
            ):
                values = {"status": "dead", "last_error": "superseded_or_opted_out"}
                suppressed += 1
            else:
                first = timestamp(row.get("first_attempt_at"))
                if first and (datetime.now(UTC) - first).total_seconds() >= 23 * 3600:
                    values = {"status": "dead", "last_error": "retry_window_expired"}
                    suppressed += 1
                else:
                    request = row.get("frozen_request")
                    if not request:
                        if payload.get("measurement_group_id"):
                            from .measurement import registered

                            payload.update(
                                registered.prepare_group(
                                    str(payload["measurement_group_id"]), user
                                )
                            )
                        request = line_messaging.prepare_push(user, payload)
                        if request is None:
                            raise line_messaging.LineProviderError(
                                "line_not_linked", retryable=False, attempted=False
                            )
                        line_messaging.reserve_budget(line_messaging.LINE_PUSH_URL)
                        # Save before any provider call. Stable body, recipients and key.
                        values = {
                            "frozen_request": request,
                            "first_attempt_at": datetime.now(UTC).isoformat(),
                        }
                        changed = (
                            db.get_client()
                            .table("notification_outbox")
                            .update(values)
                            .eq("id", row["id"])
                            .eq("lease_token", row["lease_token"])
                            .gt("lease_until", datetime.now(UTC).isoformat())
                            .execute()
                            .data
                        )
                        if not changed:
                            continue
                    if row.get("frozen_request"):
                        line_messaging.reserve_budget(line_messaging.LINE_PUSH_URL)
                    current = supabase_client.get_line_notification_link(user) or {}
                    if (
                        not current.get("active")
                        or current.get("line_user_id") != request["to"]
                    ):
                        values = {
                            "status": "dead",
                            "last_error": "line_recipient_changed",
                        }
                        suppressed += 1
                    else:
                        alive = (
                            db.get_client()
                            .rpc(
                                "touch_line_outbox",
                                {
                                    "p_event": str(row["id"]),
                                    "p_lease": row["lease_token"],
                                },
                            )
                            .execute()
                            .data
                        )
                        if not alive:
                            continue
                        request_id = line_messaging.post_push(
                            request, line_retry_key(str(row["id"]))
                        )
                        values = {
                            "status": "sent",
                            "last_error": None,
                            "provider_request_id": request_id,
                            "processed_at": datetime.now(UTC).isoformat(),
                            "attempts": row["attempts"] + 1,
                            "frozen_request": None,
                            "payload": {"tag": payload.get("tag"), "channel": "line"},
                        }
                        accepted += 1
        except notifications.NotificationDeferred:
            values = {
                "status": "pending",
                "next_attempt_at": (
                    datetime.now(UTC) + timedelta(minutes=5)
                ).isoformat(),
                "last_error": "quiet_hours",
            }
        except line_messaging.LineProviderError as exc:
            failed += 1
            attempts = row["attempts"] + int(exc.attempted)
            terminal = not exc.retryable or attempts >= 8
            delay = max(
                exc.retry_after, min(3600, 2 ** min(attempts, 10)) + uniform(0, 10)
            )
            values = {
                "status": "dead" if terminal else "failed",
                "attempts": attempts,
                "last_error": exc.reason,
                "next_attempt_at": (
                    datetime.now(UTC) + timedelta(seconds=delay)
                ).isoformat(),
            }
        except ConfigurationError:
            failed += 1
            values = {
                "status": "failed",
                "last_error": "line_configuration",
                "next_attempt_at": (
                    datetime.now(UTC) + timedelta(minutes=15)
                ).isoformat(),
            }
        except Exception:
            failed += 1
            attempts = row["attempts"] + 1
            values = {
                "status": "dead" if attempts >= 8 else "failed",
                "attempts": attempts,
                "last_error": "delivery_processing_error",
                "next_attempt_at": (
                    datetime.now(UTC) + timedelta(minutes=5)
                ).isoformat(),
            }
        if values.get("status") == "dead":
            values.update(
                frozen_request=None,
                payload={"tag": row["payload"].get("tag"), "channel": "line"},
            )
        # State resolution and the final outcome share one fenced transaction.
        db.get_client().rpc(
            "finish_line_outbox",
            {
                "p_event": str(row["id"]),
                "p_lease": row["lease_token"],
                "p_values": values,
            },
        ).execute()
    return {
        "processed": len(rows),
        "accepted": accepted,
        "failed": failed,
        "suppressed": suppressed,
    }
