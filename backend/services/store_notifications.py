"""Notifications persistence; shared client and demo behavior stay centralized."""

from __future__ import annotations

from datetime import UTC, datetime

from ..core.config import settings
from ..core.errors import UpstreamError
from . import local_store
from . import store_client as db


def upsert_line_notification_link(user_id: str, values: dict) -> dict:
    row = {
        "user_id": user_id,
        **values,
        "updated_at": datetime.now(UTC).isoformat(),
    }
    if settings.local_demo_mode:
        return local_store.upsert_line_notification_link(user_id, row)
    rows = (
        db.get_client()
        .table("line_notification_links")
        .upsert(row, on_conflict="user_id")
        .execute()
        .data
        or []
    )
    return rows[0] if rows else row


def get_line_notification_link(user_id: str) -> dict | None:
    if settings.local_demo_mode:
        return local_store.get_line_notification_link(user_id)
    rows = (
        db.get_client()
        .table("line_notification_links")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def get_line_notification_link_by_code(code_hash: str) -> dict | None:
    if settings.local_demo_mode:
        return local_store.get_line_notification_link_by_code(code_hash)
    rows = (
        db.get_client()
        .table("line_notification_links")
        .select("*")
        .eq("link_code_hash", code_hash)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def get_line_notification_link_by_line_user(line_user_id: str) -> dict | None:
    if settings.local_demo_mode:
        return local_store.get_line_notification_link_by_line_user(line_user_id)
    rows = (
        db.get_client()
        .table("line_notification_links")
        .select("*")
        .eq("line_user_id", line_user_id)
        .eq("active", True)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def deactivate_line_notification_link(
    *, user_id: str | None = None, line_user_id: str | None = None
) -> bool:
    if settings.local_demo_mode:
        return local_store.deactivate_line_notification_link(
            user_id=user_id, line_user_id=line_user_id
        )
    query = (
        db.get_client()
        .table("line_notification_links")
        .update({"active": False, "updated_at": datetime.now(UTC).isoformat()})
    )
    if user_id:
        query = query.eq("user_id", user_id)
    elif line_user_id:
        query = query.eq("line_user_id", line_user_id)
    else:
        return False
    return bool(query.execute().data or [])


def claim_line_webhook_event(event_id: str) -> bool:
    if settings.local_demo_mode:
        return local_store.claim_line_webhook_event(event_id)
    result = (
        db.get_client()
        .rpc("claim_line_webhook_event", {"p_event_id": event_id})
        .execute()
        .data
    )
    return bool(result)


def release_line_webhook_event(event_id: str) -> None:
    if settings.local_demo_mode:
        local_store.release_line_webhook_event(event_id)
        return
    db.get_client().table("line_webhook_events").delete().eq(
        "event_id", event_id
    ).execute()


def upsert_notification_preferences(user_id: str, values: dict) -> dict:
    row = {"user_id": user_id, **values, "updated_at": datetime.now(UTC).isoformat()}
    if settings.local_demo_mode:
        return local_store.upsert_notification_preferences(user_id, row)
    rows = (
        db.get_client()
        .table("notification_preferences")
        .upsert(row, on_conflict="user_id")
        .execute()
        .data
        or []
    )
    return rows[0] if rows else row


def get_notification_preferences(user_id: str) -> dict | None:
    if settings.local_demo_mode:
        return local_store.get_notification_preferences(user_id)
    rows = (
        db.get_client()
        .table("notification_preferences")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None


def list_notification_preferences() -> list[dict]:
    if settings.local_demo_mode:
        return local_store.list_notification_preferences()
    rows = []
    cursor = None
    while True:
        query = (
            db.get_client()
            .table("notification_preferences")
            .select("*")
            .order("user_id")
            .limit(1000)
        )
        if cursor is not None:
            query = query.gt("user_id", cursor)
        page = query.execute().data or []
        rows.extend(page)
        if len(page) < 1000:
            return rows
        next_cursor = page[-1]["user_id"]
        if next_cursor == cursor:
            raise UpstreamError("notification_preferences_cursor_stalled")
        cursor = next_cursor


def create_alert_if_new(row: dict) -> dict | None:
    if settings.local_demo_mode:
        return local_store.create_alert_if_new(row)
    existing = (
        db.get_client()
        .table("alert_events")
        .select("id")
        .eq("deduplication_key", row["deduplication_key"])
        .limit(1)
        .execute()
        .data
        or []
    )
    if existing:
        return None
    rows = db.get_client().table("alert_events").insert(row).execute().data or []
    return rows[0] if rows else row


def update_alert_event(event_id: str, values: dict) -> None:
    if settings.local_demo_mode:
        local_store.update_alert_event(event_id, values)
        return
    db.get_client().table("alert_events").update(values).eq("id", event_id).execute()


def create_user_notification(row: dict) -> dict:
    if settings.local_demo_mode:
        return local_store.create_user_notification(row)
    rows = (
        db.get_client()
        .table("user_notifications")
        .upsert(row, on_conflict="user_id,deduplication_key", ignore_duplicates=True)
        .execute()
        .data
        or []
    )
    if rows:
        return rows[0]
    existing = (
        db.get_client()
        .table("user_notifications")
        .select("*")
        .eq("user_id", row["user_id"])
        .eq("deduplication_key", row["deduplication_key"])
        .limit(1)
        .execute()
        .data
        or []
    )
    return existing[0] if existing else row


def list_user_notifications(user_id: str, limit: int = 50) -> list[dict]:
    if settings.local_demo_mode:
        return local_store.list_user_notifications(user_id, limit)
    return (
        db.get_client()
        .table("user_notifications")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    ).data or []


def mark_notification_read(notification_id: str, user_id: str) -> bool:
    if settings.local_demo_mode:
        return local_store.mark_notification_read(notification_id, user_id)
    rows = (
        db.get_client()
        .table("user_notifications")
        .update({"read_at": datetime.now(UTC).isoformat()})
        .eq("id", notification_id)
        .eq("user_id", user_id)
        .execute()
    ).data or []
    return bool(rows)


def mark_all_notifications_read(user_id: str) -> int:
    if settings.local_demo_mode:
        return local_store.mark_all_notifications_read(user_id)
    rows = (
        db.get_client()
        .table("user_notifications")
        .update({"read_at": datetime.now(UTC).isoformat()})
        .eq("user_id", user_id)
        .is_("read_at", "null")
        .execute()
    ).data or []
    return len(rows)


def create_outbox_event(row: dict) -> dict:
    if settings.local_demo_mode:
        return local_store.create_outbox_event(row)
    rows = (
        db.get_client()
        .table("notification_outbox")
        .upsert(row, on_conflict="event_key", ignore_duplicates=True)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else row


def list_pending_outbox(limit: int = 100) -> list[dict]:
    if settings.local_demo_mode:
        return local_store.list_pending_outbox(limit)
    now = datetime.now(UTC).isoformat()
    return (
        db.get_client()
        .table("notification_outbox")
        .select("*")
        .in_("status", ["pending", "failed"])
        .lte("next_attempt_at", now)
        .order("created_at")
        .limit(limit)
        .execute()
    ).data or []


def update_outbox_event(event_id: str, values: dict) -> dict:
    if settings.local_demo_mode:
        return local_store.update_outbox_event(event_id, values)
    values = {**values, "updated_at": datetime.now(UTC).isoformat()}
    rows = (
        db.get_client()
        .table("notification_outbox")
        .update(values)
        .eq("id", event_id)
        .execute()
    ).data or []
    return rows[0] if rows else {"id": event_id, **values}


def notification_outbox_summary() -> dict:
    if settings.local_demo_mode:
        return local_store.notification_outbox_summary()
    if settings.line_durable_delivery_enabled:
        return db.get_client().rpc("line_delivery_metrics").execute().data
    rows = (
        db.get_client()
        .table("notification_outbox")
        .select("status,created_at,updated_at,last_error")
        .order("created_at", desc=True)
        .limit(1000)
        .execute()
    ).data or []
    counts = {
        status: 0 for status in ("pending", "processing", "sent", "failed", "dead")
    }
    for row in rows:
        status = str(row.get("status", "pending"))
        counts[status] = counts.get(status, 0) + 1
    waiting = [
        row for row in rows if row.get("status", "pending") in {"pending", "failed"}
    ]
    waiting.sort(key=lambda row: str(row.get("created_at", "")))
    failed = [row for row in rows if row.get("status") in {"failed", "dead"}]
    failed.sort(key=lambda row: str(row.get("updated_at", "")), reverse=True)
    return {
        **counts,
        "oldest_waiting_at": waiting[0].get("created_at") if waiting else None,
        "latest_error": failed[0].get("last_error") if failed else None,
    }
