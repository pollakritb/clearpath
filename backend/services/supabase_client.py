"""Supabase (PostgreSQL) — source of truth ของข้อมูลสถานี + ประวัติ

ใช้ service_role key (server only). ฟังก์ชันเป็น sync — เรียกผ่าน run_in_threadpool
ใน router ที่เป็น async
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from urllib.parse import quote

from supabase import Client, create_client

from ..core.config import settings
from ..core.errors import ConfigurationError
from . import local_store

_client: Client | None = None

STATION_COLS = [
    "id",
    "name_th",
    "name_en",
    "lat",
    "lon",
    "province",
    "district",
    "pm25",
    "aqi",
    "color",
    "level",
    "recorded_at",
]


def get_client() -> Client:
    global _client
    if _client is None:
        if not settings.has_supabase:
            raise ConfigurationError(
                "ยังไม่ได้ตั้งค่า Supabase (SUPABASE_URL / SERVICE_ROLE_KEY)"
            )
        _client = create_client(
            settings.supabase_url, settings.supabase_service_role_key
        )
    return _client


def get_auth_user(access_token: str) -> dict:
    """Validate a Supabase access token without trusting client identity fields."""
    response = get_client().auth.get_user(access_token)
    user = response.user
    if user is None:
        raise ValueError("invalid auth user")
    return {
        "id": str(user.id),
        "email": user.email,
        "user_metadata": user.user_metadata or {},
    }


def upsert_stations(stations: list[dict]) -> int:
    """upsert ค่าล่าสุดของแต่ละสถานี (ตาราง stations)"""
    if settings.local_demo_mode:
        return local_store.upsert_stations(stations)
    now = datetime.now(UTC).isoformat()
    rows = []
    for s in stations:
        if not s.get("id"):
            continue
        row = {c: s.get(c) for c in STATION_COLS}
        row["updated_at"] = now
        rows.append(row)
    if rows:
        get_client().table("stations").upsert(rows).execute()
    return len(rows)


def insert_readings(stations: list[dict]) -> int:
    """append ประวัติรายชั่วโมง (ตาราง pm25_readings) — ข้ามค่าซ้ำด้วย on_conflict"""
    if settings.local_demo_mode:
        return local_store.insert_readings(stations)
    rows = [
        {
            "station_id": s["id"],
            "pm25": s.get("pm25"),
            "aqi": s.get("aqi"),
            "recorded_at": s["recorded_at"],
            "source_at": s["recorded_at"],
            "source_status": "observed",
        }
        for s in stations
        if s.get("id") and s.get("recorded_at") and s.get("pm25") is not None
    ]
    if rows:
        get_client().table("pm25_readings").upsert(
            rows, on_conflict="station_id,recorded_at", ignore_duplicates=True
        ).execute()
    return len(rows)


def get_stations() -> list[dict]:
    if settings.local_demo_mode:
        return local_store.get_stations()
    res = get_client().table("stations").select("*").execute()
    return res.data or []


def get_station_by_id(station_id: str) -> dict | None:
    if settings.local_demo_mode:
        return next(
            (row for row in local_store.get_stations() if str(row["id"]) == station_id),
            None,
        )
    rows = (
        get_client()
        .table("stations")
        .select("*")
        .eq("id", station_id)
        .limit(1)
        .execute()
    ).data or []
    return rows[0] if rows else None


def get_history(station_id: str, hours: int = 24) -> list[dict]:
    if settings.local_demo_mode:
        return local_store.get_history(station_id, hours)
    cutoff = (datetime.now(UTC) - timedelta(hours=hours)).isoformat()
    res = (
        get_client()
        .table("pm25_readings")
        .select("recorded_at,pm25,aqi")
        .eq("station_id", station_id)
        .gte("recorded_at", cutoff)
        .order("recorded_at")
        .execute()
    )
    return res.data or []


def create_provider_sync_run(row: dict) -> dict:
    if settings.local_demo_mode:
        return local_store.create_provider_sync_run(row)
    rows = (
        get_client().table("forecast_provider_sync_runs").insert(row).execute().data
        or []
    )
    return rows[0] if rows else row


def update_provider_sync_run(run_id: str, values: dict) -> dict:
    if settings.local_demo_mode:
        return local_store.update_provider_sync_run(run_id, values)
    rows = (
        get_client()
        .table("forecast_provider_sync_runs")
        .update(values)
        .eq("id", run_id)
        .execute()
        .data
        or []
    )
    return rows[0] if rows else {"id": run_id, **values}


def upsert_provider_snapshots(rows: list[dict]) -> int:
    if not rows:
        return 0
    if settings.local_demo_mode:
        return local_store.upsert_provider_snapshots(rows)
    get_client().table("forecast_provider_snapshots").upsert(
        rows, on_conflict="station_id,provider,issued_at,forecast_at"
    ).execute()
    return len(rows)


def get_provider_snapshots(station_id: str) -> list[dict]:
    if settings.local_demo_mode:
        return local_store.get_provider_snapshots(station_id)
    return (
        get_client()
        .table("forecast_provider_snapshots")
        .select("*")
        .eq("station_id", station_id)
        .order("issued_at", desc=True)
        .limit(500)
        .execute()
        .data
        or []
    )


def upsert_forecast_consensus(
    row: dict, sources: list[dict], feature: dict | None = None
) -> None:
    if settings.local_demo_mode:
        local_store.upsert_forecast_consensus(row, sources, feature)
        return
    get_client().table("forecast_consensus_latest").upsert(
        row, on_conflict="station_id,horizon_hours"
    ).execute()
    if sources:
        get_client().table("forecast_prediction_sources").insert(sources).execute()
    if feature:
        get_client().table("community_forecast_feature_snapshots").insert(
            feature
        ).execute()


def get_forecast_consensus(
    station_id: str, horizon_hours: int | None = None
) -> list[dict]:
    if settings.local_demo_mode:
        return local_store.get_forecast_consensus(station_id, horizon_hours)
    query = (
        get_client()
        .table("forecast_consensus_latest")
        .select("*")
        .eq("station_id", station_id)
    )
    if horizon_hours is not None:
        query = query.eq("horizon_hours", horizon_hours)
    return query.order("horizon_hours").execute().data or []


def list_forecast_consensus(horizon_hours: int) -> list[dict]:
    if settings.local_demo_mode:
        return local_store.list_forecast_consensus(horizon_hours)
    return (
        get_client()
        .table("forecast_consensus_latest")
        .select("*")
        .eq("horizon_hours", horizon_hours)
        .execute()
        .data
        or []
    )


def forecast_provider_health() -> dict:
    if settings.local_demo_mode:
        runs = local_store.list_provider_sync_runs(20)
    else:
        runs = (
            get_client()
            .table("forecast_provider_sync_runs")
            .select("*")
            .order("started_at", desc=True)
            .limit(20)
            .execute()
            .data
            or []
        )
    latest = {}
    for row in runs:
        latest.setdefault(str(row.get("provider") or "unknown"), row)
    consensus = list_forecast_consensus(1)
    agreement_counts = {
        level: sum(row.get("agreement") == level for row in consensus)
        for level in ("high", "medium", "low")
    }
    return {
        "providers": list(latest.values()),
        "consensus": {
            "station_count": len(consensus),
            "multi_provider_count": sum(
                int(row.get("provider_count") or 0) >= 2 for row in consensus
            ),
            "community_influenced_count": sum(
                int(row.get("community_report_count") or 0) > 0 for row in consensus
            ),
            "agreement_counts": agreement_counts,
        },
        "feature_flags": {
            "openweather": settings.openweather_air_enabled,
            "openmeteo_cams": settings.openmeteo_air_enabled,
            "community_forecast_shadow": settings.community_forecast_shadow_enabled,
        },
    }


# ── Community platform ─────────────────────────────────────
def ensure_profile(
    user_id: str, display_name: str | None = None, role: str | None = None
) -> dict:
    if settings.local_demo_mode:
        return local_store.ensure_profile(user_id, display_name, role)
    existing = (
        get_client().table("profiles").select("*").eq("id", user_id).limit(1).execute()
    ).data or []
    if existing:
        return existing[0]
    row = {
        "id": user_id,
        "display_name": display_name or f"สมาชิก-{user_id[-6:]}",
        "reputation_score": 0,
        "approved_reports": 0,
        "helpful_reviews": 0,
        "role": role or "user",
    }
    get_client().table("profiles").insert(row).execute()
    return row


def get_profile(user_id: str) -> dict:
    if settings.local_demo_mode:
        return local_store.get_profile(user_id)
    rows = (
        get_client().table("profiles").select("*").eq("id", user_id).limit(1).execute()
    ).data or []
    return rows[0] if rows else ensure_profile(user_id)


def list_user_ids(limit: int = 2000) -> list[str]:
    if settings.local_demo_mode:
        return local_store.list_user_ids(limit)
    rows = get_client().table("profiles").select("id").limit(limit).execute().data or []
    return [str(row["id"]) for row in rows]


def upload_report_image(path: str, content: bytes, content_type: str) -> None:
    if settings.local_demo_mode:
        local_store.upload_image(path, content, content_type)
        return
    get_client().storage.from_(settings.report_image_bucket).upload(
        path,
        content,
        {"content-type": content_type, "upsert": "false"},
    )


def delete_report_image(path: str) -> None:
    if settings.local_demo_mode:
        local_store.delete_image(path)
        return
    get_client().storage.from_(settings.report_image_bucket).remove([path])


def create_capture_session(row: dict) -> dict:
    if settings.local_demo_mode:
        return local_store.create_capture_session(row)
    rows = get_client().table("capture_sessions").insert(row).execute().data or []
    return rows[0] if rows else row


def get_capture_session(session_id: str) -> dict | None:
    if settings.local_demo_mode:
        return local_store.get_capture_session(session_id)
    rows = (
        get_client()
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
        get_client()
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
    rows = get_client().table("report_drafts").insert(row).execute().data or []
    return rows[0] if rows else row


def get_report_draft(draft_id: str, user_id: str) -> dict | None:
    if settings.local_demo_mode:
        return local_store.get_report_draft(draft_id, user_id)
    rows = (
        get_client()
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
        get_client()
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
        get_client()
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
        get_client()
        .table("report_drafts")
        .select("id,image_path,submitted_at,expires_at")
        .lte("expires_at", now)
        .order("expires_at")
        .limit(limit)
        .execute()
    ).data or []


def delete_expired_report_draft(draft_id: str) -> None:
    if settings.local_demo_mode:
        local_store.delete_expired_report_draft(draft_id)
        return
    get_client().table("report_drafts").delete().eq("id", draft_id).execute()


def upsert_report_evidence(row: dict) -> dict:
    if settings.local_demo_mode:
        return local_store.upsert_report_evidence(row)
    rows = (
        get_client()
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
        get_client()
        .table("report_evidence")
        .select("*")
        .eq("report_id", report_id)
        .limit(1)
        .execute()
    ).data or []
    return rows[0] if rows else None


def take_rate_limit(
    actor_key: str, action: str, window_seconds: int, limit: int
) -> bool:
    if settings.local_demo_mode:
        return local_store.take_rate_limit(actor_key, action, window_seconds, limit)
    result = (
        get_client()
        .rpc(
            "take_rate_limit",
            {
                "p_actor_key": actor_key,
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
    rows = get_client().table("sync_runs").insert(row).execute().data or []
    return rows[0] if rows else row


def create_audit_log(row: dict) -> dict:
    if settings.local_demo_mode:
        return local_store.create_audit_log(row)
    rows = get_client().table("audit_logs").insert(row).execute().data or []
    return rows[0] if rows else row


def create_data_issue(row: dict) -> dict:
    if settings.local_demo_mode:
        return local_store.create_data_issue(row)
    rows = get_client().table("data_issue_reports").insert(row).execute().data or []
    return rows[0] if rows else row


def list_data_issues(limit: int = 100) -> list[dict]:
    if settings.local_demo_mode:
        return local_store.list_data_issues(limit)
    return (
        get_client()
        .table("data_issue_reports")
        .select("id,category,reference_id,message,status,created_at,updated_at")
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    ).data or []


def create_public_map_event(row: dict) -> dict:
    if settings.local_demo_mode:
        return local_store.create_public_map_event(row)
    rows = get_client().table("public_map_events").insert(row).execute().data or []
    return rows[0] if rows else row


def update_sync_run(run_id: str, values: dict) -> dict:
    if settings.local_demo_mode:
        return local_store.update_sync_run(run_id, values)
    rows = (
        get_client().table("sync_runs").update(values).eq("id", run_id).execute().data
        or []
    )
    return rows[0] if rows else {"id": run_id, **values}


def list_sync_runs(limit: int = 50) -> list[dict]:
    if settings.local_demo_mode:
        return local_store.list_sync_runs(limit)
    return (
        get_client()
        .table("sync_runs")
        .select("*")
        .order("started_at", desc=True)
        .limit(limit)
        .execute()
    ).data or []


def upsert_push_subscription(row: dict) -> dict:
    if settings.local_demo_mode:
        return local_store.upsert_push_subscription(row)
    rows = (
        get_client()
        .table("push_subscriptions")
        .upsert(row, on_conflict="endpoint")
        .execute()
        .data
        or []
    )
    return rows[0] if rows else row


def deactivate_push_subscription(endpoint: str, user_id: str | None = None) -> None:
    if settings.local_demo_mode:
        local_store.deactivate_push_subscription(endpoint, user_id)
        return
    query = (
        get_client()
        .table("push_subscriptions")
        .update({"active": False})
        .eq("endpoint", endpoint)
    )
    if user_id:
        query = query.eq("user_id", user_id)
    query.execute()


def list_push_subscriptions(user_id: str | None = None) -> list[dict]:
    if settings.local_demo_mode:
        return local_store.list_push_subscriptions(user_id)
    query = get_client().table("push_subscriptions").select("*").eq("active", True)
    if user_id:
        query = query.eq("user_id", user_id)
    return query.execute().data or []


def upsert_line_notification_link(user_id: str, values: dict) -> dict:
    row = {
        "user_id": user_id,
        **values,
        "updated_at": datetime.now(UTC).isoformat(),
    }
    if settings.local_demo_mode:
        return local_store.upsert_line_notification_link(user_id, row)
    rows = (
        get_client()
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
        get_client()
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
        get_client()
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
        get_client()
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
        get_client()
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


def upsert_notification_preferences(user_id: str, values: dict) -> dict:
    row = {"user_id": user_id, **values, "updated_at": datetime.now(UTC).isoformat()}
    if settings.local_demo_mode:
        return local_store.upsert_notification_preferences(user_id, row)
    rows = (
        get_client()
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
        get_client()
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
    return (
        get_client().table("notification_preferences").select("*").execute().data or []
    )


def create_alert_if_new(row: dict) -> dict | None:
    if settings.local_demo_mode:
        return local_store.create_alert_if_new(row)
    existing = (
        get_client()
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
    rows = get_client().table("alert_events").insert(row).execute().data or []
    return rows[0] if rows else row


def update_alert_event(event_id: str, values: dict) -> None:
    if settings.local_demo_mode:
        local_store.update_alert_event(event_id, values)
        return
    get_client().table("alert_events").update(values).eq("id", event_id).execute()


def create_user_notification(row: dict) -> dict:
    if settings.local_demo_mode:
        return local_store.create_user_notification(row)
    rows = (
        get_client()
        .table("user_notifications")
        .upsert(row, on_conflict="user_id,deduplication_key")
        .execute()
        .data
        or []
    )
    return rows[0] if rows else row


def list_user_notifications(user_id: str, limit: int = 50) -> list[dict]:
    if settings.local_demo_mode:
        return local_store.list_user_notifications(user_id, limit)
    return (
        get_client()
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
        get_client()
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
        get_client()
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
        get_client()
        .table("notification_outbox")
        .upsert(row, on_conflict="event_key")
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
        get_client()
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
    rows = (
        get_client()
        .table("notification_outbox")
        .update(values)
        .eq("id", event_id)
        .execute()
    ).data or []
    return rows[0] if rows else {"id": event_id, **values}


def notification_outbox_summary() -> dict:
    if settings.local_demo_mode:
        return local_store.notification_outbox_summary()
    rows = (
        get_client()
        .table("notification_outbox")
        .select("status,created_at,updated_at,last_error")
        .order("created_at", desc=True)
        .limit(1000)
        .execute()
    ).data or []
    counts = {status: 0 for status in ("pending", "processing", "sent", "failed")}
    for row in rows:
        status = str(row.get("status", "pending"))
        counts[status] = counts.get(status, 0) + 1
    waiting = [
        row for row in rows if row.get("status", "pending") in {"pending", "failed"}
    ]
    waiting.sort(key=lambda row: str(row.get("created_at", "")))
    failed = [row for row in rows if row.get("status") == "failed"]
    failed.sort(key=lambda row: str(row.get("updated_at", "")), reverse=True)
    return {
        **counts,
        "oldest_waiting_at": waiting[0].get("created_at") if waiting else None,
        "latest_error": failed[0].get("last_error") if failed else None,
    }


def upsert_weather_observation(row: dict) -> None:
    row = {
        **row,
        "source_at": row.get("source_at") or row.get("recorded_at"),
        "source_status": row.get("source_status") or "observed",
    }
    if settings.local_demo_mode:
        local_store.upsert_weather_observation(row)
        return
    get_client().table("weather_observations").upsert(
        row, on_conflict="station_id,recorded_at"
    ).execute()


def upsert_weather_forecasts(rows: list[dict]) -> None:
    if not rows:
        return
    normalized = [
        {**row, "source_status": row.get("source_status") or "observed"} for row in rows
    ]
    if settings.local_demo_mode:
        local_store.upsert_weather_forecasts(normalized)
        return
    get_client().table("weather_forecasts").upsert(
        normalized, on_conflict="station_id,issued_at,forecast_at"
    ).execute()


def upsert_fire_feature(row: dict) -> None:
    row = {
        **row,
        "source_at": row.get("source_at") or row.get("recorded_at"),
        "source_status": row.get("source_status") or "observed",
    }
    if settings.local_demo_mode:
        local_store.upsert_fire_feature(row)
        return
    get_client().table("fire_feature_snapshots").upsert(
        row, on_conflict="station_id,recorded_at"
    ).execute()


def get_latest_forecast_features(station_id: str) -> dict:
    if settings.local_demo_mode:
        return local_store.get_latest_forecast_features(station_id)
    weather_rows = (
        get_client()
        .table("weather_observations")
        .select(
            "recorded_at,source_at,source_status,temperature,humidity,"
            "wind_speed,wind_deg,rain_mm"
        )
        .eq("station_id", station_id)
        .order("recorded_at", desc=True)
        .limit(1)
        .execute()
    ).data or []
    fire_rows = (
        get_client()
        .table("fire_feature_snapshots")
        .select(
            "recorded_at,source_at,source_status,hotspot_count,weighted_frp,"
            "upwind_hotspot_count"
        )
        .eq("station_id", station_id)
        .order("recorded_at", desc=True)
        .limit(1)
        .execute()
    ).data or []
    now = datetime.now(UTC)
    forecast_rows = (
        get_client()
        .table("weather_forecasts")
        .select(
            "issued_at,forecast_at,source_status,temperature,humidity,"
            "wind_speed,wind_deg,rain_mm"
        )
        .eq("station_id", station_id)
        .lte("issued_at", now.isoformat())
        .gte("forecast_at", now.isoformat())
        .order("issued_at", desc=True)
        .limit(80)
        .execute()
    ).data or []
    result: dict = {}
    if weather_rows:
        weather = weather_rows[0]
        result.update(weather)
        result["weather_source_at"] = weather.get("source_at") or weather.get(
            "recorded_at"
        )
        result["weather_status"] = weather.get("source_status") or "observed"
    if fire_rows:
        fire = fire_rows[0]
        result.update(fire)
        result["fire_source_at"] = fire.get("source_at") or fire.get("recorded_at")
        result["fire_status"] = fire.get("source_status") or "observed"
    for horizon in (1, 3, 6, 12, 24):
        target = now + timedelta(hours=horizon)
        eligible = []
        for row in forecast_rows:
            try:
                distance = abs(
                    (
                        datetime.fromisoformat(
                            str(row["forecast_at"]).replace("Z", "+00:00")
                        )
                        - target
                    ).total_seconds()
                )
            except (KeyError, TypeError, ValueError):
                continue
            if distance <= 90 * 60:
                eligible.append((distance, row))
        if not eligible:
            result[f"forecast_weather_status_h{horizon}"] = "missing"
            continue
        row = min(eligible, key=lambda item: item[0])[1]
        result[f"forecast_weather_status_h{horizon}"] = (
            row.get("source_status") or "observed"
        )
        result[f"forecast_weather_issued_at_h{horizon}"] = row.get("issued_at")
        for name in ("temperature", "humidity", "wind_speed", "wind_deg", "rain_mm"):
            result[f"forecast_{name}_h{horizon}"] = row.get(name)
    return result


def get_active_forecast_model(horizon_hours: int) -> dict | None:
    return get_runtime_forecast_model(horizon_hours, prefer_canary=False)


def get_runtime_forecast_model(
    horizon_hours: int, *, prefer_canary: bool = False
) -> dict | None:
    if settings.local_demo_mode:
        return None
    statuses = ("canary", "active") if prefer_canary else ("active",)
    for status in statuses:
        rows = (
            get_client()
            .table("model_registry")
            .select("*")
            .eq("environment", settings.app_environment)
            .eq("horizon_hours", horizon_hours)
            .eq("activation_status", status)
            .order("updated_at", desc=True)
            .limit(1)
            .execute()
        ).data or []
        if rows:
            return rows[0]
    return None


def get_shadow_forecast_model(horizon_hours: int) -> dict | None:
    if settings.local_demo_mode:
        return None
    rows = (
        get_client()
        .table("model_registry")
        .select("*")
        .eq("environment", settings.app_environment)
        .eq("horizon_hours", horizon_hours)
        .eq("activation_status", "shadow")
        .order("updated_at", desc=True)
        .limit(1)
        .execute()
    ).data or []
    return rows[0] if rows else None


def insert_forecast_ledger(run: dict, predictions: list[dict]) -> None:
    """Persist a run and its predictions; callers schedule this after response."""

    if settings.local_demo_mode:
        local_store.insert_forecast_ledger(run, predictions)
        return
    get_client().table("forecast_runs").insert(run).execute()
    if predictions:
        get_client().table("forecast_predictions").insert(predictions).execute()


def get_unsettled_forecast_predictions(limit: int = 500) -> list[dict]:
    if settings.local_demo_mode:
        return []
    return (
        get_client()
        .table("forecast_predictions")
        .select("*,forecast_runs!inner(station_id,environment)")
        .is_("settled_at", "null")
        .lte("forecast_at", datetime.now(UTC).isoformat())
        .order("forecast_at")
        .limit(limit)
        .execute()
    ).data or []


def get_observation_near(
    station_id: str,
    target_at: str,
    tolerance_minutes: int = 45,
) -> dict | None:
    target = datetime.fromisoformat(target_at.replace("Z", "+00:00"))
    if target.tzinfo is None:
        target = target.replace(tzinfo=UTC)
    if settings.local_demo_mode:
        rows = local_store.get_history(station_id, 168)
    else:
        delta = timedelta(minutes=tolerance_minutes)
        rows = (
            get_client()
            .table("pm25_readings")
            .select("recorded_at,pm25")
            .eq("station_id", station_id)
            .gte("recorded_at", (target - delta).isoformat())
            .lte("recorded_at", (target + delta).isoformat())
            .execute()
        ).data or []
    candidates = []
    for row in rows:
        try:
            observed_at = datetime.fromisoformat(
                str(row["recorded_at"]).replace("Z", "+00:00")
            )
            distance = abs((observed_at - target).total_seconds())
            if distance <= tolerance_minutes * 60 and row.get("pm25") is not None:
                candidates.append((distance, row))
        except (KeyError, TypeError, ValueError):
            continue
    return min(candidates, key=lambda item: item[0])[1] if candidates else None


def settle_forecast_prediction(
    run_id: str, horizon_hours: int, variant: str, values: dict
) -> None:
    if settings.local_demo_mode:
        return
    (
        get_client()
        .table("forecast_predictions")
        .update(values)
        .eq("run_id", run_id)
        .eq("horizon_hours", horizon_hours)
        .eq("variant", variant)
        .is_("settled_at", "null")
        .execute()
    )


def list_settled_forecast_predictions(since_at: str, limit: int = 10000) -> list[dict]:
    if settings.local_demo_mode:
        return []
    return (
        get_client()
        .table("forecast_predictions")
        .select(
            "*,forecast_runs!inner(station_id,district,environment,fallback_reason,latency_ms)"
        )
        .not_.is_("settled_at", "null")
        .gte("forecast_at", since_at)
        .order("forecast_at")
        .limit(limit)
        .execute()
    ).data or []


def upsert_forecast_evaluation(rows: list[dict]) -> None:
    if not rows or settings.local_demo_mode:
        return
    get_client().table("forecast_evaluation_daily").upsert(rows).execute()


def get_forecast_evaluation_summary(days: int = 14) -> list[dict]:
    if settings.local_demo_mode:
        return []
    cutoff = (datetime.now(UTC).date() - timedelta(days=days - 1)).isoformat()
    return (
        get_client()
        .table("forecast_evaluation_daily")
        .select("*")
        .gte("evaluation_date", cutoff)
        .order("evaluation_date", desc=True)
        .order("horizon_hours")
        .limit(10000)
        .execute()
    ).data or []


def list_forecast_false_safe_cases(days: int = 30, limit: int = 100) -> list[dict]:
    """Return settled false-safe events plus any private administrator review."""

    if settings.local_demo_mode:
        return []
    cutoff = (datetime.now(UTC) - timedelta(days=days)).isoformat()
    return (
        get_client()
        .table("forecast_predictions")
        .select(
            "run_id,horizon_hours,variant,forecast_at,pm25,lower,upper,method,"
            "model_version,observed_pm25,observed_at,absolute_error,signed_error,"
            "settled_at,forecast_runs!inner(station_id,district,environment),"
            "forecast_false_safe_reviews(disposition,note,reviewed_at)"
        )
        .eq("false_safe", True)
        .gte("settled_at", cutoff)
        .order("settled_at", desc=True)
        .limit(limit)
        .execute()
    ).data or []


def upsert_forecast_false_safe_review(row: dict) -> dict:
    if settings.local_demo_mode:
        return local_store.upsert_forecast_false_safe_review(row)
    result = (
        get_client()
        .table("forecast_false_safe_reviews")
        .upsert(row, on_conflict="run_id,horizon_hours,variant")
        .execute()
    )
    return result.data[0]


def list_forecast_release_decisions(limit: int = 100) -> list[dict]:
    if settings.local_demo_mode:
        return []
    return (
        get_client()
        .table("forecast_release_decisions")
        .select(
            "id,registry_id,decision,environment,actor_id,reason,evidence,created_at,"
            "model_registry(model_name,horizon_hours,version,activation_status)"
        )
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    ).data or []


def delete_forecast_runs_before(cutoff_at: str, limit: int = 1000) -> int:
    """Delete old run batches; prediction rows cascade from the run foreign key."""

    if settings.local_demo_mode:
        return local_store.delete_forecast_runs_before(cutoff_at, limit)
    rows = (
        get_client()
        .table("forecast_runs")
        .select("id")
        .lt("generated_at", cutoff_at)
        .order("generated_at")
        .limit(limit)
        .execute()
    ).data or []
    run_ids = [str(row["id"]) for row in rows]
    if not run_ids:
        return 0
    get_client().table("forecast_runs").delete().in_("id", run_ids).execute()
    return len(run_ids)


def list_forecast_monitoring_rows(since_at: str, until_at: str) -> list[dict]:
    if settings.local_demo_mode:
        return local_store.list_forecast_monitoring_rows(since_at, until_at)
    return (
        get_client()
        .table("forecast_predictions")
        .select(
            "pm25,horizon_hours,method,model_version,"
            "forecast_runs!inner(generated_at,environment,feature_quality)"
        )
        .gte("forecast_runs.generated_at", since_at)
        .lt("forecast_runs.generated_at", until_at)
        .limit(20000)
        .execute()
    ).data or []


def insert_forecast_drift_snapshots(rows: list[dict]) -> None:
    if not rows or settings.local_demo_mode:
        return
    get_client().table("forecast_drift_snapshots").upsert(rows).execute()


def list_source_quality_rows(
    source_name: str, since_at: str, until_at: str
) -> list[dict]:
    if settings.local_demo_mode:
        if source_name != "pm25":
            return []
        output = []
        for station in local_store.get_stations():
            output.extend(
                {
                    **row,
                    "station_id": station["id"],
                    "source_status": "observed",
                }
                for row in local_store.get_history(str(station["id"]), 48)
                if since_at <= str(row.get("recorded_at")) < until_at
            )
        return output
    mapping = {
        "pm25": ("pm25_readings", "recorded_at"),
        "weather": ("weather_observations", "recorded_at"),
        "forecast_weather": ("weather_forecasts", "issued_at"),
        "fire": ("fire_feature_snapshots", "recorded_at"),
    }
    if source_name not in mapping:
        raise ValueError("quality_source_unsupported")
    table, timestamp_column = mapping[source_name]
    rows = (
        get_client()
        .table(table)
        .select(f"station_id,{timestamp_column},source_status")
        .gte(timestamp_column, since_at)
        .lt(timestamp_column, until_at)
        .limit(10000)
        .execute()
    ).data or []
    return [{**row, "recorded_at": row.get(timestamp_column)} for row in rows]


def upsert_forecast_data_quality(rows: list[dict]) -> None:
    if not rows or settings.local_demo_mode:
        return
    get_client().table("forecast_data_quality_daily").upsert(rows).execute()


def get_forecast_data_quality_summary(days: int = 7) -> list[dict]:
    if settings.local_demo_mode:
        return []
    cutoff = (datetime.now(UTC).date() - timedelta(days=days - 1)).isoformat()
    return (
        get_client()
        .table("forecast_data_quality_daily")
        .select("*")
        .gte("quality_date", cutoff)
        .order("quality_date", desc=True)
        .order("source_name")
        .order("station_id")
        .limit(5000)
        .execute()
    ).data or []


def signed_report_image_url(path: str | None, expires_in: int = 3600) -> str | None:
    if not path:
        return None
    if settings.local_demo_mode:
        token = local_store.image_token(path)
        return f"/api/community/local-images/{quote(path, safe='/')}?token={token}"
    try:
        result = (
            get_client()
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
    data = get_client().table("community_reports").insert(row).execute().data or []
    return data[0] if data else row


def get_community_report(report_id: str) -> dict | None:
    if settings.local_demo_mode:
        return local_store.get_report(report_id)
    rows = (
        get_client()
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
        get_client()
        .table("community_reports")
        .select("*")
        .order("created_at", desc=True)
        .limit(limit)
    )
    if status != "all":
        query = query.eq("status", status)
    return query.execute().data or []


def list_user_reports(user_id: str, limit: int = 50) -> list[dict]:
    if settings.local_demo_mode:
        rows = local_store.list_user_reports(user_id, limit)
    else:
        rows = (
            get_client()
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


def count_user_reports_since(user_id: str, cutoff: str) -> int:
    if settings.local_demo_mode:
        return local_store.count_user_reports_since(user_id, cutoff)
    rows = (
        get_client()
        .table("community_reports")
        .select("id")
        .eq("user_id", user_id)
        .gte("created_at", cutoff)
        .execute()
    ).data or []
    return len(rows)


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
        get_client()
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
        get_client()
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
        get_client()
        .table("report_evidence")
        .select("report_id,image_path,retention_until")
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
    get_client().table("report_evidence").update(
        {
            "exact_lat": None,
            "exact_lon": None,
            "gps_accuracy_m": None,
            "image_path": None,
            "image_sha256": None,
            "image_ahash": None,
            "burst_hashes": [],
            "ocr_raw_text": None,
            "purged_at": purged_at,
        }
    ).eq("report_id", report_id).execute()
    report = get_community_report(report_id) or {}
    get_client().table("community_reports").update(
        {
            "lat": report.get("public_lat", report.get("lat")),
            "lon": report.get("public_lon", report.get("lon")),
            "gps_accuracy_m": None,
            "image_path": None,
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
    get_client().table("community_reports").delete().eq("id", report_id).execute()


def upsert_report_review(row: dict) -> None:
    if settings.local_demo_mode:
        local_store.upsert_review(row)
        return
    get_client().table("report_reviews").upsert(
        row, on_conflict="report_id,reviewer_id"
    ).execute()


def get_report_reviews(report_id: str) -> list[dict]:
    if settings.local_demo_mode:
        return local_store.get_reviews(report_id)
    return (
        get_client()
        .table("report_reviews")
        .select("*")
        .eq("report_id", report_id)
        .execute()
    ).data or []


def mark_review_rewarded(report_id: str, reviewer_id: str) -> None:
    rewarded_at = datetime.now(UTC).isoformat()
    if settings.local_demo_mode:
        local_store.mark_review_rewarded(report_id, reviewer_id, rewarded_at)
        return
    (
        get_client()
        .table("report_reviews")
        .update({"rewarded_at": rewarded_at})
        .eq("report_id", report_id)
        .eq("reviewer_id", reviewer_id)
        .is_("rewarded_at", "null")
        .execute()
    )


def apply_reputation_event(
    user_id: str,
    points: int,
    reason: str,
    report_id: str | None = None,
    idempotency_key: str | None = None,
) -> dict:
    if settings.local_demo_mode:
        return local_store.apply_event(user_id, points, reason, report_id)
    key = idempotency_key or f"{reason}:{report_id or user_id}"
    result = (
        get_client()
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
        return updated
    result = (
        get_client()
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
        get_client()
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
        get_client()
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
        get_client()
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
        get_client()
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
        get_client()
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
            get_client()
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
                get_client()
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
            get_client()
            .table("announcements")
            .select("*")
            .order("updated_at", desc=True)
            .limit(limit)
            .execute()
        ).data or []
    return [_present_announcement(row) for row in rows]


def upload_announcement_image(path: str, content: bytes, content_type: str) -> str:
    if settings.local_demo_mode:
        local_store.upload_image(path, content, content_type)
        return signed_report_image_url(path) or ""
    get_client().storage.from_("announcement-images").upload(
        path, content, {"content-type": content_type, "upsert": "false"}
    )
    result = get_client().storage.from_("announcement-images").get_public_url(path)
    return (
        result
        if isinstance(result, str)
        else result.get("publicUrl", "")
        if isinstance(result, dict)
        else ""
    )


def create_announcement(row: dict) -> dict:
    if settings.local_demo_mode:
        return _present_announcement(local_store.create_announcement(row))
    rows = get_client().table("announcements").insert(row).execute().data or []
    return _present_announcement(rows[0] if rows else row)


def update_announcement(announcement_id: str, values: dict) -> dict:
    if settings.local_demo_mode:
        return _present_announcement(
            local_store.update_announcement(announcement_id, values)
        )
    rows = (
        get_client()
        .table("announcements")
        .update(values)
        .eq("id", announcement_id)
        .execute()
    ).data or []
    if not rows:
        raise KeyError(announcement_id)
    return _present_announcement(rows[0])


def get_activities() -> list[dict]:
    if settings.local_demo_mode:
        rows = local_store.activities()
    else:
        rows = (
            get_client()
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


def create_activity(row: dict) -> dict:
    if settings.local_demo_mode:
        return local_store.create_activity(row)
    rows = get_client().table("activities").insert(row).execute().data or []
    return rows[0] if rows else row
