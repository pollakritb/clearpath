"""Owner-confirmed account closure with durable server-only retry.

Published anonymous measurements and audits follow existing retention.
Export uses selected columns and subject filters, never entire database rows.
"""

from datetime import UTC, datetime
from threading import RLock
from uuid import uuid4

from ..core.config import settings
from ..core.errors import ConfigurationError, UpstreamError
from . import supabase_client as db

SECTIONS = {
    "alert_location": (
        "air_alert_locations",
        "lat,lon,accuracy_m,observed_at,received_at",
    ),
    "reports": (
        "community_reports",
        "id,created_at,captured_at,status,pm25,lat,lon,province,district,subdistrict,device_model,measurement_environment,measurement_note",
    ),
    "points": (
        "community_xp_events",
        "id,report_id,kind,points,occurred_at,recorded_at,policy_version",
    ),
    "saved_locations": (
        "measurement_helper_locations",
        "slot,name,address,lat,lon,enabled,updated_at",
    ),
    "requests": (
        "measurement_requests",
        "id,place_name,lat,lon,radius_km,status,created_at,expires_at",
    ),
    "comments": ("report_comments", "id,report_id,body,created_at"),
    "reactions": ("report_reactions", "report_id,reaction,created_at"),
    "notifications": (
        "user_notifications",
        "id,title,body,url,event_type,created_at,read_at",
    ),
}
DEMO_REQUESTS: dict[str, dict] = {}
_LOCK = RLock()


def enabled() -> bool:
    return settings.local_demo_mode or settings.account_privacy_enabled


def _ready():
    if not enabled():
        raise ConfigurationError("การจัดการข้อมูลบัญชียังไม่เปิดใช้งาน")


def requests(user_id: str) -> list[dict]:
    if not enabled():
        return []
    if settings.local_demo_mode:
        with _LOCK:
            return [
                dict(row) for row in DEMO_REQUESTS.values() if row["user_id"] == user_id
            ]
    try:
        return (
            db.get_client()
            .table("account_privacy_requests")
            .select("id,status,created_at,completed_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(20)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        raise UpstreamError("โหลดคำขอจัดการบัญชีไม่สำเร็จ") from exc


def request_deletion(user_id: str) -> dict:
    _ready()
    if not settings.local_demo_mode:
        try:
            row = (
                db.get_client()
                .rpc("request_account_erasure", {"p_user": user_id})
                .execute()
                .data
            )
            from .account_erasure import process

            completed = process(request_id=row["id"])
            return completed.get("request") or row
        except Exception as exc:
            raise UpstreamError("บันทึกคำขอลบบัญชีไม่สำเร็จ") from exc
    with _LOCK:
        old = next(
            (
                r
                for r in DEMO_REQUESTS.values()
                if r["user_id"] == user_id
                and r["status"] in {"pending", "processing", "completed"}
            ),
            None,
        )
        if old:
            return dict(old)
        row = {
            "id": str(uuid4()),
            "user_id": user_id,
            "status": "completed",
            "created_at": datetime.now(UTC).isoformat(),
            "completed_at": datetime.now(UTC).isoformat(),
        }
        DEMO_REQUESTS[row["id"]] = row
        return dict(row)


def export_page(user_id: str, section: str, offset: int) -> dict:
    _ready()
    table, columns = SECTIONS[section]
    if settings.local_demo_mode:
        from . import local_store

        if section == "reports":
            rows = [
                r
                for r in local_store.list_reports("all", 1000000)
                if str(r["user_id"]) == user_id
            ]
        else:
            from . import air_alerts
            from .community import xp
            from .measurement import registered, store

            sources = {
                "alert_location": list(air_alerts.LOCATIONS.values()),
                "points": xp._EVENTS,
                "saved_locations": list(registered.LOCATIONS.values()),
                "requests": list(store.REQUESTS.values()),
                "comments": list(local_store._REPORT_COMMENTS.values()),
                "reactions": list(local_store._REPORT_REACTIONS.values()),
                "notifications": list(local_store._USER_NOTIFICATIONS.values()),
            }
            rows = [
                r for r in sources.get(section, []) if str(r.get("user_id")) == user_id
            ]
        fields = columns.split(",")
        items = [{k: row.get(k) for k in fields} for row in rows[offset : offset + 101]]
    else:
        try:
            key = (
                "user_id"
                if section == "alert_location"
                else "slot"
                if section == "saved_locations"
                else "report_id"
                if section == "reactions"
                else "id"
            )
            items = (
                db.get_client()
                .table(table)
                .select(columns)
                .eq("user_id", user_id)
                .order(key)
                .range(offset, offset + 100)
                .execute()
                .data
                or []
            )
        except Exception as exc:
            raise UpstreamError("ส่งออกข้อมูลไม่สำเร็จ กรุณาลองใหม่") from exc
    return {
        "section": section,
        "items": items[:100],
        "next_offset": offset + 100 if len(items) > 100 else None,
        "generated_at": datetime.now(UTC).isoformat(),
    }
