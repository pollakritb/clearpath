"""Report records, history, publication transactions and social engagement persistence."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from postgrest.exceptions import APIError

from ..core.config import settings
from ..core.errors import UpstreamError
from . import local_store
from . import store_client as db
from .identifier_client import IdentifierClient
from .store_profiles import get_profile
from .store_stations import get_stations


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
    cursor = None
    while True:

        def read_page(cursor=cursor):
            client = db.get_client()
            query = (
                client.table("community_reports")
                .select("*")
                .eq("status", "approved")
                .gt("captured_at", cutoff.isoformat())
                .lte("captured_at", target.isoformat())
                .lte("created_at", target.isoformat())
                .order("captured_at")
                .order("id")
                .limit(page_size)
            )
            if cursor is not None:
                at, identifier = cursor
                # .or_ is raw PostgREST syntax: only server-produced timestamps
                # and resolved numeric IDs are allowed inside this expression.
                numeric = (
                    client.resolve("community_reports", identifier)
                    if isinstance(client, IdentifierClient)
                    else int(identifier)
                )
                query = query.or_(
                    f"captured_at.gt.{at},and(captured_at.eq.{at},id.gt.{numeric})"
                )
            return query.execute()

        page = db._execute_read(read_page).data or []
        rows.extend(page)
        if len(page) < page_size:
            return rows
        next_cursor = (page[-1]["captured_at"], page[-1]["id"])
        if next_cursor == cursor:
            raise UpstreamError("map_history_cursor_stalled")
        cursor = next_cursor


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

        if policy_v2.publication_snapshot()["active_version"] != "v1":
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
