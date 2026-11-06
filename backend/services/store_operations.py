"""Operations persistence; shared client and demo behavior stay centralized."""

from __future__ import annotations

from ..core.config import settings
from . import local_store
from . import store_client as db


def take_rate_limit(
    actor_key: str, action: str, window_seconds: int, limit: int
) -> bool:
    if settings.local_demo_mode:
        return local_store.take_rate_limit(actor_key, action, window_seconds, limit)
    result = (
        db.get_client()
        .rpc(
            "take_rate_limit",
            {
                "p_actor_key": db.stable_identifier("profiles", actor_key)
                if actor_key.startswith("USR-")
                else actor_key,
                "p_action": action,
                "p_window_seconds": window_seconds,
                "p_limit": limit,
            },
        )
        .execute()
    )
    return bool(result.data)


def create_sync_run(row: dict) -> dict:
    if settings.local_demo_mode:
        return local_store.create_sync_run(row)
    rows = db.get_client().table("sync_runs").insert(row).execute().data or []
    return rows[0] if rows else row


def create_audit_log(row: dict) -> dict:
    if settings.local_demo_mode:
        return local_store.create_audit_log(row)
    rows = db.get_client().table("audit_logs").insert(row).execute().data or []
    return rows[0] if rows else row


def list_audit_logs(
    limit: int = 100,
    offset: int = 0,
    action: str | None = None,
    entity_type: str | None = None,
) -> list[dict]:
    if settings.local_demo_mode:
        return local_store.list_audit_logs(limit, offset, action, entity_type)
    query = (
        db.get_client()
        .table("audit_logs")
        .select("id,actor_id,action,entity_type,entity_id,details,created_at")
    )
    if action:
        query = query.eq("action", action)
    if entity_type:
        query = query.eq("entity_type", entity_type)
    return (
        query.order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
        .data
        or []
    )


def list_data_issues(limit: int = 100) -> list[dict]:
    if settings.local_demo_mode:
        return local_store.list_data_issues(limit)
    return (
        db.get_client()
        .table("data_issue_reports")
        .select("id,category,reference_id,message,status,created_at,updated_at")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    ).data or []


def create_public_map_event(row: dict) -> dict:
    if settings.local_demo_mode:
        return local_store.create_public_map_event(row)
    rows = db.get_client().table("public_map_events").insert(row).execute().data or []
    return rows[0] if rows else row


def update_sync_run(run_id: str, values: dict) -> dict:
    if settings.local_demo_mode:
        return local_store.update_sync_run(run_id, values)
    rows = (
        db.get_client()
        .table("sync_runs")
        .update(values)
        .eq("id", run_id)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else {"id": run_id, **values}


def list_sync_runs(limit: int = 50) -> list[dict]:
    if settings.local_demo_mode:
        return local_store.list_sync_runs(limit)
    return (
        db.get_client()
        .table("sync_runs")
        .select("*")
        .order("started_at", desc=True)
        .limit(limit)
        .execute()
    ).data or []


def latest_primary_sync_run() -> dict | None:
    """Latest successful Air4Thai primary sync, for backup deduplication."""
    if settings.local_demo_mode:
        return next(
            (
                row
                for row in local_store.list_sync_runs(100)
                if row.get("source") == "air4thai_supabase_primary"
                and row.get("status") == "success"
            ),
            None,
        )
    rows = (
        db.get_client()
        .table("sync_runs")
        .select("completed_at")
        .eq("source", "air4thai_supabase_primary")
        .eq("status", "success")
        .order("completed_at", desc=True)
        .limit(1)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else None
