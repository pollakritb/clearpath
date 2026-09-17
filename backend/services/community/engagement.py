"""Social engagement kept separate from report verification and Trust Score."""

from datetime import UTC, datetime
from uuid import uuid4

from .. import supabase_client


def _approved_report(report_id: str) -> dict:
    report = supabase_client.get_community_report(report_id)
    if not report:
        raise KeyError(report_id)
    if report.get("status") != "approved":
        raise ValueError("แสดงปฏิกิริยาและความคิดเห็นได้เฉพาะรายงานที่เผยแพร่แล้ว")
    return report


def _present_comment(row: dict, viewer_id: str | None = None) -> dict:
    return {
        "id": str(row["id"]),
        "report_id": str(row["report_id"]),
        "user_id": str(row["user_id"]),
        "display_name": row.get("display_name") or "สมาชิก ClearPath",
        "avatar_url": row.get("avatar_url"),
        "body": str(row["body"]),
        "created_at": str(row["created_at"]),
        "is_own": viewer_id is not None and str(row["user_id"]) == viewer_id,
    }


def get_engagement(
    report_id: str, viewer_id: str | None = None, comment_limit: int = 30
) -> dict:
    report = _approved_report(report_id)
    reaction = (
        supabase_client.get_report_reaction(report_id, viewer_id) if viewer_id else None
    )
    comments = supabase_client.list_report_comments(report_id, comment_limit)
    return {
        "like_count": int(report.get("like_count") or 0),
        "dislike_count": int(report.get("dislike_count") or 0),
        "comment_count": int(report.get("comment_count") or 0),
        "viewer_reaction": reaction.get("reaction") if reaction else None,
        "comments": [_present_comment(row, viewer_id) for row in comments],
    }


def set_reaction(report_id: str, user_id: str, reaction: str) -> dict:
    report = _approved_report(report_id)
    if str(report["user_id"]) == user_id:
        raise ValueError("ไม่สามารถกดถูกใจหรือไม่ถูกใจรายงานของตนเองได้")
    if reaction not in {"like", "dislike"}:
        raise ValueError("ปฏิกิริยาไม่ถูกต้อง")
    now = datetime.now(UTC).isoformat()
    existing = supabase_client.get_report_reaction(report_id, user_id)
    supabase_client.upsert_report_reaction(
        {
            "report_id": report_id,
            "user_id": user_id,
            "reaction": reaction,
            "created_at": existing.get("created_at") if existing else now,
            "updated_at": now,
        }
    )
    return get_engagement(report_id, user_id)


def clear_reaction(report_id: str, user_id: str) -> dict:
    _approved_report(report_id)
    supabase_client.delete_report_reaction(report_id, user_id)
    return get_engagement(report_id, user_id)


def add_comment(
    report_id: str, user_id: str, body: str, display_name: str | None = None
) -> dict:
    _approved_report(report_id)
    cleaned = body.strip()
    if not cleaned:
        raise ValueError("กรุณาพิมพ์ความคิดเห็น")
    if len(cleaned) > 500:
        raise ValueError("ความคิดเห็นยาวได้ไม่เกิน 500 ตัวอักษร")
    supabase_client.ensure_profile(user_id, display_name)
    now = datetime.now(UTC).isoformat()
    saved = supabase_client.create_report_comment(
        {
            "id": str(uuid4()),
            "report_id": report_id,
            "user_id": user_id,
            "body": cleaned,
            "status": "published",
            "created_at": now,
            "updated_at": now,
        }
    )
    profile = supabase_client.get_profile(user_id)
    saved["display_name"] = profile.get("display_name")
    saved["avatar_url"] = profile.get("avatar_url")
    return _present_comment(saved, user_id)


def remove_comment(comment_id: str, user_id: str) -> bool:
    return supabase_client.delete_report_comment(comment_id, user_id)
