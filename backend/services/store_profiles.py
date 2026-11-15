"""Profiles, legacy leaderboard reads and published feed persistence."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from ..core.config import settings
from . import local_store
from . import store_client as db
from .store_report_media import signed_report_image_url


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
