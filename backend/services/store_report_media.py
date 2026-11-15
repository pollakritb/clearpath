"""Private report drafts, capture sessions, image storage and evidence persistence."""

from __future__ import annotations

from datetime import UTC, datetime
from urllib.parse import quote

from ..core.config import settings
from . import local_store
from . import store_client as db


def upload_report_image(path: str, content: bytes, content_type: str) -> None:
    if settings.local_demo_mode:
        local_store.upload_image(path, content, content_type)
        return
    db.get_client().storage.from_(settings.report_image_bucket).upload(
        path,
        content,
        {"content-type": content_type, "upsert": "false"},
    )


def delete_report_image(path: str) -> None:
    if settings.local_demo_mode:
        local_store.delete_image(path)
        return
    db.get_client().storage.from_(settings.report_image_bucket).remove([path])


def create_capture_session(row: dict) -> dict:
    if settings.local_demo_mode:
        return local_store.create_capture_session(row)
    rows = db.get_client().table("capture_sessions").insert(row).execute().data or []
    return rows[0] if rows else row


def get_capture_session(session_id: str) -> dict | None:
    if settings.local_demo_mode:
        return local_store.get_capture_session(session_id)
    rows = (
        db.get_client()
        .table("capture_sessions")
        .select("*")
        .eq("id", session_id)
        .limit(1)
        .execute()
    ).data or []
    return rows[0] if rows else None


def consume_capture_session(session_id: str, user_id: str) -> bool:
    consumed_at = datetime.now(UTC).isoformat()
    if settings.local_demo_mode:
        return local_store.consume_capture_session(session_id, user_id, consumed_at)
    result = (
        db.get_client()
        .rpc(
            "consume_capture_session",
            {"p_session_id": session_id, "p_user_id": user_id},
        )
        .execute()
    )
    return bool(result.data)


def create_report_draft(row: dict) -> dict:
    if settings.local_demo_mode:
        return local_store.create_report_draft(row)
    rows = db.get_client().table("report_drafts").insert(row).execute().data or []
    return rows[0] if rows else row


def get_report_draft(draft_id: str, user_id: str) -> dict | None:
    if settings.local_demo_mode:
        return local_store.get_report_draft(draft_id, user_id)
    rows = (
        db.get_client()
        .table("report_drafts")
        .select("*")
        .eq("id", draft_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    ).data or []
    return rows[0] if rows else None


def update_report_draft(draft_id: str, values: dict) -> dict:
    if settings.local_demo_mode:
        return local_store.update_report_draft(draft_id, values)
    rows = (
        db.get_client()
        .table("report_drafts")
        .update(values)
        .eq("id", draft_id)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else {"id": draft_id, **values}


def delete_report_draft(draft_id: str, user_id: str) -> dict | None:
    if settings.local_demo_mode:
        return local_store.delete_report_draft(draft_id, user_id)
    rows = (
        db.get_client()
        .table("report_drafts")
        .delete()
        .eq("id", draft_id)
        .eq("user_id", user_id)
        .execute()
    ).data or []
    return rows[0] if rows else None


def list_expired_report_drafts(limit: int = 200) -> list[dict]:
    now = datetime.now(UTC).isoformat()
    if settings.local_demo_mode:
        return local_store.list_expired_report_drafts(now, limit)
    return (
        db.get_client()
        .table("report_drafts")
        .select("id,image_path,original_image_path,submitted_at,expires_at")
        .lte("expires_at", now)
        .order("expires_at")
        .limit(limit)
        .execute()
    ).data or []


def delete_expired_report_draft(draft_id: str) -> None:
    if settings.local_demo_mode:
        local_store.delete_expired_report_draft(draft_id)
        return
    db.get_client().table("report_drafts").delete().eq("id", draft_id).execute()


def upsert_report_evidence(row: dict) -> dict:
    if settings.local_demo_mode:
        return local_store.upsert_report_evidence(row)
    rows = (
        db.get_client()
        .table("report_evidence")
        .upsert(row, on_conflict="report_id")
        .execute()
        .data
        or []
    )
    return rows[0] if rows else row


def get_report_evidence(report_id: str) -> dict | None:
    if settings.local_demo_mode:
        return local_store.get_report_evidence(report_id)
    rows = (
        db.get_client()
        .table("report_evidence")
        .select("*")
        .eq("report_id", report_id)
        .limit(1)
        .execute()
    ).data or []
    return rows[0] if rows else None


def signed_report_image_url(path: str | None, expires_in: int = 3600) -> str | None:
    if not path:
        return None
    if settings.local_demo_mode:
        token = local_store.image_token(path)
        return f"/api/community/local-images/{quote(path, safe='/')}?token={token}"
    try:
        result = (
            db.get_client()
            .storage.from_(settings.report_image_bucket)
            .create_signed_url(path, expires_in)
        )
        if isinstance(result, dict):
            return (
                result.get("signedURL")
                or result.get("signedUrl")
                or result.get("signed_url")
            )
    except Exception:
        return None
    return None
