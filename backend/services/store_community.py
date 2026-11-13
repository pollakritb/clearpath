"""Community persistence; shared client and demo behavior stay centralized."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from urllib.parse import quote

from postgrest.exceptions import APIError

from ..core.config import settings
from . import local_store
from . import store_client as db
from .store_stations import get_stations


def ensure_profile(
    user_id: str,
    display_name: str | None = None,
    role: str | None = None,
    avatar_url: str | None = None,
    identity_provider: str | None = None,
) -> dict:
    if settings.local_demo_mode:
        return local_store.ensure_profile(
            user_id,
            display_name,
            role,
            avatar_url=avatar_url,
            identity_provider=identity_provider,
        )
    existing = (
        db.get_client()
        .table("profiles")
        .select("*")
        .eq("id", user_id)
        .limit(1)
        .execute()
    ).data or []
    if existing:
        current = existing[0]
        if current.get("deletion_started_at"):
            from fastapi import HTTPException

            raise HTTPException(401, detail="บัญชีนี้อยู่ระหว่างการลบหรือถูกลบแล้ว")
        updates = {}
        if display_name and display_name != current.get("display_name"):
            updates["display_name"] = display_name
        if avatar_url and avatar_url != current.get("avatar_url"):
            updates["avatar_url"] = avatar_url
        if identity_provider and identity_provider != current.get("identity_provider"):
            updates["identity_provider"] = identity_provider
        if not updates:
            return current
        client = db.get_client()
        if (
            isinstance(client, db.IdentifierClient)
            and client.raw.rpc("identifier_schema_state", {})
            .execute()
            .data["maintenance"]
        ):
            return current
        rows = (
            db.get_client()
            .table("profiles")
            .update(updates)
            .eq("id", user_id)
            .execute()
            .data
            or []
        )
        return rows[0] if rows else {**current, **updates}
    row = {
        "id": user_id,
        "display_name": display_name or f"สมาชิก-{user_id[-6:]}",
        "avatar_url": avatar_url,
        "identity_provider": identity_provider,
        "reputation_score": 0,
        "approved_reports": 0,
        "helpful_reviews": 0,
        "role": role or "user",
    }
    rows = db.get_client().table("profiles").insert(row).execute().data or []
    return rows[0] if rows else row


def get_profile(user_id: str) -> dict:
    if settings.local_demo_mode:
        return local_store.get_profile(user_id)
    rows = (
        db.get_client()
        .table("profiles")
        .select("*")
        .eq("id", user_id)
        .limit(1)
        .execute()
    ).data or []
    return rows[0] if rows else ensure_profile(user_id)


def get_existing_profile(user_id: str) -> dict:
    if settings.local_demo_mode:
        return local_store.get_existing_profile(user_id)
    rows = (
        db.get_client()
        .table("profiles")
        .select("*")
        .eq("id", user_id)
        .limit(1)
        .execute()
    ).data or []
    if not rows:
        raise KeyError(user_id)
    return rows[0]


def list_user_ids(limit: int = 2000) -> list[str]:
    if settings.local_demo_mode:
        return local_store.list_user_ids(limit)
    rows = (
        db.get_client().table("profiles").select("id").limit(limit).execute().data or []
    )
    return [str(row["id"]) for row in rows]


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


def insert_community_report(row: dict) -> dict:
    if settings.local_demo_mode:
        return local_store.insert_report(row)
    data = db.get_client().table("community_reports").insert(row).execute().data or []
    return data[0] if data else row


def insert_community_report_once(row: dict) -> tuple[dict, bool]:
    """Insert a deterministic report id without duplicating a retried submit."""
    if settings.local_demo_mode:
        return local_store.insert_report_once(row)
    try:
        data = (
            db.get_client()
            .table("community_reports")
            .upsert(row, on_conflict="id", ignore_duplicates=True)
            .execute()
            .data
            or []
        )
    except APIError as exc:
        if str(exc.code) == "23505" and "image_sha256" in str(exc):
            raise ValueError("ภาพนี้เคยส่งรายงานแล้ว กรุณาใช้ภาพการวัดใหม่") from exc
        raise
    if data:
        return data[0], True
    existing = get_community_report(str(row["id"]))
    if not existing:
        raise RuntimeError("report insert did not return or persist a row")
    return existing, False


def get_community_report(report_id: str) -> dict | None:
    if settings.local_demo_mode:
        return local_store.get_report(report_id)
    rows = (
        db.get_client()
        .table("community_reports")
        .select("*")
        .eq("id", report_id)
        .limit(1)
        .execute()
    ).data or []
    return rows[0] if rows else None


def list_community_reports(status: str = "approved", limit: int = 200) -> list[dict]:
    if settings.local_demo_mode:
        return local_store.list_reports(status, limit)
    query = (
        db.get_client()
        .table("community_reports")
        .select("*")
        .order("created_at", desc=True)
        .limit(limit)
    )
    if status != "all":
        query = query.eq("status", status)
    return db._execute_read(query.execute).data or []


def get_map_history_reports(
    target_at: datetime, max_age_minutes: float = 180
) -> list[dict]:
    """Read all approved reports in a bounded historical lifetime, with pagination."""
    if settings.local_demo_mode:
        return local_store.get_map_history_reports(target_at, max_age_minutes)
    target = target_at.astimezone(UTC)
    cutoff = target - timedelta(minutes=max_age_minutes)
    rows: list[dict] = []
    page_size = 1000
    while True:
        offset = len(rows)
        page = (
            db._execute_read(
                lambda start=offset: (
                    db.get_client()
                    .table("community_reports")
                    .select("*")
                    .eq("status", "approved")
                    .gt("captured_at", cutoff.isoformat())
                    .lte("captured_at", target.isoformat())
                    .lte("created_at", target.isoformat())
                    .order("captured_at")
                    .order("id")
                    .range(start, start + page_size - 1)
                    .execute()
                )
            ).data
            or []
        )
        rows.extend(page)
        if len(page) < page_size:
            return rows


def list_user_reports(user_id: str, limit: int = 50) -> list[dict]:
    if settings.local_demo_mode:
        rows = local_store.list_user_reports(user_id, limit)
    else:
        rows = (
            db.get_client()
            .table("community_reports")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        ).data or []
    official = get_stations()
    approved = list_community_reports("approved", 500)
    from .community.presenter import present_report

    return [
        present_report(
            row,
            official_stations=official,
            approved_reports=approved,
            include_image=False,
            include_exact_location=False,
            include_private_metadata=True,
        )
        for row in rows
    ]


def get_report_by_image_sha256(sha256: str) -> dict | None:
    if settings.local_demo_mode:
        return local_store.get_report_by_image_sha256(sha256)
    rows = (
        db.get_client()
        .table("community_reports")
        .select("id,image_sha256")
        .eq("image_sha256", sha256)
        .limit(1)
        .execute()
    ).data or []
    return rows[0] if rows else None


def get_recent_image_fingerprints(limit: int = 500) -> list[dict]:
    if settings.local_demo_mode:
        return [
            {
                "id": row.get("id"),
                "user_id": row.get("user_id"),
                "image_sha256": row.get("image_sha256"),
                "image_ahash": row.get("image_ahash"),
                "created_at": row.get("created_at"),
            }
            for row in local_store.list_reports("all", limit)
        ]
    return (
        db.get_client()
        .table("community_reports")
        .select("id,user_id,image_sha256,image_ahash,created_at")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    ).data or []


def update_community_report(report_id: str, values: dict) -> dict:
    if settings.local_demo_mode:
        return local_store.update_report(report_id, values)
    rows = (
        db.get_client()
        .table("community_reports")
        .update(values)
        .eq("id", report_id)
        .execute()
    ).data or []
    return rows[0] if rows else {**values, "id": report_id}


def list_expired_report_evidence(limit: int = 200) -> list[dict]:
    now = datetime.now(UTC).isoformat()
    if settings.local_demo_mode:
        return local_store.list_expired_report_evidence(now, limit)
    return (
        db.get_client()
        .table("report_evidence")
        .select("report_id,image_path,original_image_path,retention_until")
        .eq("audit_hold", False)
        .is_("purged_at", "null")
        .not_.is_("retention_until", "null")
        .lte("retention_until", now)
        .order("retention_until")
        .limit(limit)
        .execute()
    ).data or []


def purge_report_evidence(report_id: str) -> None:
    purged_at = datetime.now(UTC).isoformat()
    if settings.local_demo_mode:
        local_store.purge_report_evidence(report_id, purged_at)
        return
    db.get_client().table("report_evidence").update(
        {
            "exact_lat": None,
            "exact_lon": None,
            "gps_accuracy_m": None,
            "image_path": None,
            "image_metadata": {},
            "original_image_path": None,
            "image_sha256": None,
            "image_ahash": None,
            "unexpected_exif": False,
            "burst_hashes": [],
            "ocr_raw_text": None,
            "ocr_status": "unavailable",
            "purged_at": purged_at,
        }
    ).eq("report_id", report_id).execute()
    report = get_community_report(report_id) or {}
    db.get_client().table("community_reports").update(
        {
            "lat": report.get("public_lat", report.get("lat")),
            "lon": report.get("public_lon", report.get("lon")),
            "gps_accuracy_m": None,
            "image_path": None,
            "image_metadata": {},
            "image_sha256": None,
            "image_ahash": None,
            "burst_hashes": [],
            "ocr_raw_text": None,
            "evidence_purged_at": purged_at,
        }
    ).eq("id", report_id).execute()


def delete_community_report(report_id: str) -> None:
    if settings.local_demo_mode:
        local_store.delete_community_report(report_id)
        return
    db.get_client().table("community_reports").delete().eq("id", report_id).execute()


def get_report_reviews(report_id: str) -> list[dict]:
    if settings.local_demo_mode:
        return local_store.get_reviews(report_id)
    return (
        db.get_client()
        .table("report_reviews")
        .select("*")
        .eq("report_id", report_id)
        .execute()
    ).data or []


def upsert_report_reaction(row: dict) -> dict:
    if settings.local_demo_mode:
        return local_store.upsert_report_reaction(row)
    data = (
        db.get_client()
        .table("report_reactions")
        .upsert(row, on_conflict="report_id,user_id")
        .execute()
        .data
        or []
    )
    return data[0] if data else row


def delete_report_reaction(report_id: str, user_id: str) -> None:
    if settings.local_demo_mode:
        local_store.delete_report_reaction(report_id, user_id)
        return
    (
        db.get_client()
        .table("report_reactions")
        .delete()
        .eq("report_id", report_id)
        .eq("user_id", user_id)
        .execute()
    )


def get_report_reaction(report_id: str, user_id: str) -> dict | None:
    if settings.local_demo_mode:
        return local_store.get_report_reaction(report_id, user_id)
    data = (
        db.get_client()
        .table("report_reactions")
        .select("report_id,user_id,reaction,created_at,updated_at")
        .eq("report_id", report_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    return data[0] if data else None


def create_report_comment(row: dict) -> dict:
    if settings.local_demo_mode:
        return local_store.create_report_comment(row)
    data = db.get_client().table("report_comments").insert(row).execute().data or []
    return data[0] if data else row


def list_report_comments(report_id: str, limit: int = 50) -> list[dict]:
    if settings.local_demo_mode:
        return local_store.list_report_comments(report_id, limit)
    rows = (
        db.get_client()
        .table("report_comments")
        .select(
            "id,report_id,user_id,body,created_at,profiles(display_name,avatar_url)"
        )
        .eq("report_id", report_id)
        .eq("status", "published")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
        .data
        or []
    )
    for row in rows:
        profile = row.pop("profiles", None) or {}
        row["display_name"] = profile.get("display_name")
        row["avatar_url"] = profile.get("avatar_url")
    return rows


def delete_report_comment(comment_id: str, user_id: str) -> bool:
    if settings.local_demo_mode:
        return local_store.delete_report_comment(comment_id, user_id)
    existing = (
        db.get_client()
        .table("report_comments")
        .select("id")
        .eq("id", comment_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data
        or []
    )
    if not existing:
        return False
    (
        db.get_client()
        .table("report_comments")
        .delete()
        .eq("id", comment_id)
        .eq("user_id", user_id)
        .execute()
    )
    return True


def apply_reputation_event(
    user_id: str,
    points: int,
    reason: str,
    report_id: str | None = None,
    idempotency_key: str | None = None,
) -> dict:
    if settings.local_demo_mode:
        return local_store.apply_event(user_id, points, reason, report_id)
    key = (
        idempotency_key
        or f"{reason}:{db.stable_identifier('community_reports' if report_id else 'profiles', report_id or user_id)}"
    )
    result = (
        db.get_client()
        .rpc(
            "apply_reputation_event",
            {
                "p_user_id": user_id,
                "p_points": points,
                "p_reason": reason,
                "p_report_id": report_id,
                "p_idempotency_key": key,
            },
        )
        .execute()
    )
    return result.data or get_profile(user_id)


def moderate_report_transaction(
    report_id: str,
    admin_id: str | None,
    decision: str,
    verified_pm25: float | None,
    note: str | None,
    trust_score: float,
    trust_reasons: list[str],
    rejection_reason_code: str | None = None,
    checks: dict | None = None,
) -> dict:
    if settings.local_demo_mode:
        before = local_store.get_report(report_id)
        if not before:
            raise KeyError(report_id)
        values = {
            "status": "approved" if decision == "approve" else "rejected",
            "pm25": verified_pm25 if decision == "approve" else None,
            "moderated_by": admin_id,
            "moderation_note": note,
            "moderated_at": datetime.now(UTC).isoformat(),
            "rejection_reason_code": rejection_reason_code
            if decision == "reject"
            else None,
            "moderation_checks": checks or {},
            "admin_verified_pm25": verified_pm25 if decision == "approve" else None,
            "policy_version": "trust-v2",
            "retention_until": (
                datetime.now(UTC) + timedelta(days=180 if decision == "approve" else 30)
            ).isoformat(),
        }
        if decision == "approve":
            values.update(
                {
                    "base_trust_score": trust_score,
                    "trust_score": trust_score,
                    "trust_reasons": trust_reasons,
                }
            )
        updated = local_store.update_report(report_id, values)
        invalid_reasons = {
            "value_mismatch",
            "suspected_screen_recapture",
            "invalid_location",
            "duplicate",
        }
        reason = (
            "report_approved"
            if decision == "approve"
            else "report_rejected_invalid"
            if rejection_reason_code in invalid_reasons
            else "report_rejected_technical"
        )
        prior_invalid = local_store.count_events_since(
            str(updated["user_id"]), "report_rejected_invalid", ""
        )
        points = (
            10
            if decision == "approve"
            else -5 - min(prior_invalid * 2, 10)
            if reason == "report_rejected_invalid"
            else 0
        )
        from .community import policy_v2

        if policy_v2.active():
            points = 0
        local_store.apply_event(
            str(updated["user_id"]),
            points,
            reason,
            report_id,
        )
        evidence = local_store.get_report_evidence(report_id)
        if evidence:
            local_store.upsert_report_evidence(
                {**evidence, "retention_until": values["retention_until"]}
            )
        local_store.create_audit_log(
            {
                "actor_id": admin_id,
                "action": f"report_{values['status']}",
                "entity_type": "community_report",
                "entity_id": report_id,
                "details": {
                    "before": {
                        "status": before.get("status"),
                        "pm25": before.get("pm25"),
                    },
                    "after": {
                        "status": updated.get("status"),
                        "pm25": updated.get("pm25"),
                    },
                    "reason": note,
                    "rejection_reason_code": rejection_reason_code,
                    "checks": checks or {},
                    "policy_version": "trust-v2",
                },
            }
        )
        return updated
    result = (
        db.get_client()
        .rpc(
            "moderate_community_report_v2",
            {
                "p_report_id": report_id,
                "p_admin_id": admin_id,
                "p_decision": decision,
                "p_verified_pm25": verified_pm25,
                "p_rejection_reason_code": rejection_reason_code,
                "p_checks": checks or {},
                "p_note": note,
                "p_trust_score": trust_score,
                "p_trust_reasons": trust_reasons,
            },
        )
        .execute()
    )
    if not result.data:
        raise ValueError("บันทึกผลตรวจไม่สำเร็จ")
    return result.data


def count_reputation_events_since(user_id: str, reason: str, cutoff: str) -> int:
    if settings.local_demo_mode:
        return local_store.count_events_since(user_id, reason, cutoff)
    rows = (
        db.get_client()
        .table("reputation_events")
        .select("id")
        .eq("user_id", user_id)
        .eq("reason", reason)
        .gte("created_at", cutoff)
        .execute()
    ).data or []
    return len(rows)


def get_user_weekly_points(user_id: str) -> int:
    if settings.local_demo_mode:
        return local_store.get_user_weekly_points(user_id)
    cutoff = (datetime.now(UTC) - timedelta(days=7)).isoformat()
    rows = (
        db.get_client()
        .table("reputation_events")
        .select("points")
        .eq("user_id", user_id)
        .gte("created_at", cutoff)
        .execute()
    ).data or []
    return max(0, sum(int(row.get("points") or 0) for row in rows))


def get_leaderboard(limit: int = 20) -> list[dict]:
    if settings.local_demo_mode:
        return local_store.leaderboard(limit)
    return (
        db.get_client()
        .table("profiles")
        .select(
            "id,display_name,role,reputation_score,approved_reports,helpful_reviews"
        )
        .order("reputation_score", desc=True)
        .limit(limit)
        .execute()
    ).data or []


def get_weekly_leaderboard(limit: int = 20) -> list[dict]:
    """Rank by points earned in the rolling last 7 days, then all-time reputation."""
    if settings.local_demo_mode:
        return local_store.leaderboard(limit, weekly=True)
    cutoff = (datetime.now(UTC) - timedelta(days=7)).isoformat()
    events = (
        db.get_client()
        .table("reputation_events")
        .select("user_id,points,created_at")
        .gte("created_at", cutoff)
        .execute()
    ).data or []
    weekly: dict[str, int] = {}
    for event in events:
        user_id = str(event["user_id"])
        weekly[user_id] = weekly.get(user_id, 0) + int(event.get("points") or 0)
    user_ids = list(weekly)
    if not user_ids:
        return []
    profiles = (
        db.get_client()
        .table("profiles")
        .select(
            "id,display_name,role,reputation_score,approved_reports,helpful_reviews"
        )
        .in_("id", user_ids)
        .execute()
    ).data or []
    rows = [
        {**profile, "weekly_points": max(0, weekly.get(str(profile["id"]), 0))}
        for profile in profiles
    ]
    rows.sort(
        key=lambda row: (
            int(row.get("weekly_points") or 0),
            int(row.get("reputation_score") or 0),
        ),
        reverse=True,
    )
    return rows[:limit]


def get_announcements(limit: int = 20) -> list[dict]:
    if settings.local_demo_mode:
        rows = local_store.announcements()
    else:
        rows = (
            db.get_client()
            .table("announcements")
            .select("*")
            .eq("published", True)
            .eq("status", "published")
            .order("published_at", desc=True)
            .limit(max(limit * 2, 40))
            .execute()
        ).data or []
    now = datetime.now(UTC)
    active = []
    for row in rows:
        # Enforce the public publication policy after retrieval as well.  This
        # keeps local demo behavior identical to Supabase and prevents a
        # malformed/upstream row from leaking drafts or archived content.
        if row.get("published") is not True or row.get("status") != "published":
            continue
        expires_at = row.get("expires_at")
        if expires_at:
            try:
                expiry = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
                if expiry <= now:
                    continue
            except ValueError:
                continue
        active.append(_present_announcement(row))
    return active[:limit]


def _present_announcement(row: dict) -> dict:
    image_url = None
    if row.get("image_path"):
        if settings.local_demo_mode:
            image_url = signed_report_image_url(str(row["image_path"]))
        else:
            result = (
                db.get_client()
                .storage.from_("announcement-images")
                .get_public_url(str(row["image_path"]))
            )
            image_url = (
                result
                if isinstance(result, str)
                else result.get("publicUrl")
                if isinstance(result, dict)
                else None
            )
    return {**row, "image_url": image_url}


def list_admin_announcements(limit: int = 100) -> list[dict]:
    if settings.local_demo_mode:
        rows = local_store.announcements()[:limit]
    else:
        rows = (
            db.get_client()
            .table("announcements")
            .select("*")
            .order("updated_at", desc=True)
            .limit(limit)
            .execute()
        ).data or []
    return [_present_announcement(row) for row in rows]


def get_activities() -> list[dict]:
    if settings.local_demo_mode:
        rows = local_store.activities()
    else:
        rows = (
            db.get_client()
            .table("activities")
            .select("*")
            .eq("active", True)
            .order("created_at", desc=True)
            .execute()
        ).data or []
    now = datetime.now(UTC)
    return [
        row
        for row in rows
        if (
            not row.get("starts_at")
            or datetime.fromisoformat(str(row["starts_at"]).replace("Z", "+00:00"))
            <= now
        )
        and (
            not row.get("ends_at")
            or datetime.fromisoformat(str(row["ends_at"]).replace("Z", "+00:00")) >= now
        )
    ]
