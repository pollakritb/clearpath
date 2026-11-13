"""Nearest-pin evaluation, private last GPS and atomic episode persistence."""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from functools import wraps
from threading import RLock
from uuid import uuid4

from ..algorithms.nearest_air_alert import (
    nearest_source,
    timestamp,
    transition,
    valid_location,
)
from ..algorithms.notification_policy import BANGKOK_TZ, air_quality_level
from ..core.config import settings
from ..core.errors import ConfigurationError, UpstreamError
from ..core.identifiers import number
from . import local_store, supabase_client
from . import store_client as db

LOCATIONS: dict[str, dict] = {}
STATES: dict[str, dict] = {}
_LOCK = RLock()
logger = logging.getLogger("clearpath.air_alerts")


def storage_errors(function):
    @wraps(function)
    def guarded(*args, **kwargs):
        try:
            return function(*args, **kwargs)
        except (ValueError, ConfigurationError, UpstreamError):
            raise
        except Exception as exc:
            raise UpstreamError("โหลดหรือบันทึกข้อมูลแจ้งเตือนไม่สำเร็จ กรุณาลองใหม่") from exc

    return guarded


def in_canary(user_id: str) -> bool:
    allowed = {
        value.strip()
        for value in settings.line_alert_canary_user_ids.split(",")
        if value.strip()
    }
    if not allowed:
        return True
    try:
        canonical = str(number("profiles", user_id))
    except ValueError:
        canonical = user_id
    return canonical in allowed


@storage_errors
def location(user_id: str) -> dict | None:
    if settings.local_demo_mode:
        with _LOCK:
            return dict(LOCATIONS[user_id]) if user_id in LOCATIONS else None
    rows = (
        db.get_client()
        .table("air_alert_locations")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data
    )
    return rows[0] if rows else None


@storage_errors
def save_location(user_id: str, values: dict) -> dict:
    now = datetime.now(UTC)
    if not valid_location(values, now):
        raise ValueError("GPS ต้องมีความแม่นยำไม่เกิน 200 เมตร และมีเวลาไม่เกิน 24 ชั่วโมง")
    preferences = supabase_client.get_notification_preferences(user_id) or {}
    if not preferences.get("consent_granted") or not preferences.get(
        "air_alerts", True
    ):
        raise ValueError("เปิดการแจ้งเตือนและยินยอมใช้ตำแหน่งก่อน")
    if settings.local_demo_mode:
        with _LOCK:
            current = LOCATIONS.get(user_id)
            if current and timestamp(current["observed_at"]) >= timestamp(
                values["observed_at"]
            ):
                return dict(current)
            row = {
                **values,
                "user_id": user_id,
                "received_at": now.isoformat(),
                "version": str(uuid4()),
            }
            LOCATIONS[user_id] = row
            return dict(row)
    return (
        db.get_client()
        .rpc("set_air_alert_location", {"p_user": user_id, "p_location": values})
        .execute()
        .data
    )


@storage_errors
def clear_location(user_id: str) -> None:
    if settings.local_demo_mode:
        with _LOCK:
            LOCATIONS.pop(user_id, None)
        return
    db.get_client().table("air_alert_locations").delete().eq(
        "user_id", user_id
    ).execute()


@storage_errors
def candidates(point: dict, radius: float) -> list[dict]:
    if not settings.local_demo_mode:
        return (
            db.get_client()
            .rpc(
                "air_alert_candidates",
                {"p_lat": point["lat"], "p_lon": point["lon"], "p_radius": radius},
            )
            .execute()
            .data
            or []
        )
    result = [
        {
            "source_type": "station",
            "source_id": str(s["id"]),
            "name": s.get("name_th") or s["id"],
            "lat": s["lat"],
            "lon": s["lon"],
            "pm25": s.get("pm25"),
            "source_at": s.get("recorded_at"),
        }
        for s in supabase_client.get_stations()
    ]
    for r in local_store.list_reports("approved", 100000):
        if r.get("public_lat") is None or r.get("public_lon") is None:
            continue
        result.append(
            {
                "source_type": "community",
                "source_id": str(r["id"]),
                "name": "รายงานชุมชน",
                "status": r["status"],
                "lat": r["public_lat"],
                "lon": r["public_lon"],
                "pm25": r.get("pm25"),
                "source_at": r.get("captured_at"),
            }
        )
    return result


def selected(
    user_id: str, now: datetime | None = None
) -> tuple[dict, dict | None, dict | None]:
    now = now or datetime.now(UTC)
    preferences = supabase_client.get_notification_preferences(user_id) or {}
    point = location(user_id)
    if not valid_location(point, now):
        return preferences, point, None
    radius = float(preferences.get("radius_km") or 10)
    return (
        preferences,
        point,
        nearest_source(point, candidates(point, radius), radius, now),
    )


def notice_for(source: dict, point: dict, preferences: dict, key: str) -> dict:
    kind = source["source_type"]
    origin = "สถานี Air4Thai" if kind == "station" else "รายงานชุมชน"
    level = air_quality_level(source["pm25"])
    value = str(float(source["pm25"]))
    title = f"PM2.5 {value} µg/m³ ใกล้ตำแหน่งใช้งานล่าสุด"
    source_time = (
        timestamp(source["source_at"]).astimezone(BANGKOK_TZ).strftime("%d/%m/%Y %H:%M")
    )
    name = str(source.get("name") or "") if kind == "station" else ""
    body = (
        f"{origin} {name} · ห่างประมาณ {source['distance_km']:.1f} กม. · "
        f"เวลาวัด {source_time} น. (เวลาไทย) · {level['advice']}"
    )
    return {
        "title": title,
        "body": body,
        "url": f"/?{'station' if kind == 'station' else 'report'}={source['source_id']}",
        "deduplication_key": key,
        "payload": {
            **source,
            "location_version": point["version"],
            "preferences_at": preferences.get("updated_at"),
        },
    }


@storage_errors
def evaluate(user_id: str) -> bool:
    now = datetime.now(UTC)
    preferences, point, source = selected(user_id, now)
    if (
        not preferences.get("air_alerts", True)
        or not preferences.get("consent_granted")
        or not valid_location(point, now)
    ):
        return False
    if settings.line_alert_shadow_mode or not in_canary(user_id):
        logger.info(
            "air_alert_shadow source_available=%s source_type=%s threshold_met=%s",
            bool(source),
            source.get("source_type") if source else None,
            bool(
                source
                and source["pm25"]
                >= max(37.6, float(preferences.get("pm25_threshold", 37.6)))
            ),
        )
        if not settings.local_demo_mode:
            db.get_client().table("air_alert_states").update(
                {"evaluated_at": now.isoformat(), "evaluation_lease_until": None}
            ).eq("user_id", user_id).execute()
        return False
    if settings.local_demo_mode:
        with _LOCK:
            row = STATES.get(user_id, {"revision": 0, "state": {}})
            updated = transition(
                row["state"],
                source,
                float(preferences.get("pm25_threshold", 37.6)),
                now,
            )
            if location(user_id)["version"] != point["version"]:
                return False
            if updated.pop("notify"):
                from .notifications import enqueue_user_notification

                notice = notice_for(
                    source,
                    point,
                    preferences,
                    f"nearest:{user_id}:{row['revision'] + 1}",
                )
                enqueue_user_notification(
                    user_id=user_id, event_type="air_alert", **notice
                )
                sent = True
            else:
                sent = False
            STATES[user_id] = {"revision": row["revision"] + 1, "state": updated}
            return sent
    rows = (
        db.get_client()
        .table("air_alert_states")
        .select("revision,state")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data
    )
    row = rows[0] if rows else {"revision": 0, "state": {}}
    if row["state"].get("_pending_key"):
        # At most one pending alert per user. Quiet-hours collapse into one fresh
        # evaluation when the old delivery is resolved or superseded.
        db.get_client().table("air_alert_states").update(
            {"evaluated_at": now.isoformat(), "evaluation_lease_until": None}
        ).eq("user_id", user_id).eq("revision", row["revision"]).execute()
        return False
    updated = transition(
        row["state"], source, float(preferences.get("pm25_threshold", 37.6)), now
    )
    should_notify = updated.pop("notify")
    notice = (
        notice_for(
            source, point, preferences, f"nearest:{user_id}:{row['revision'] + 1}"
        )
        if should_notify
        else None
    )
    if notice:
        updated["_pending_key"] = notice["deduplication_key"]
        updated["_rollback"] = row["state"]
    committed = (
        db.get_client()
        .rpc(
            "commit_air_alert",
            {
                "p_user": user_id,
                "p_location_version": point["version"],
                "p_preferences_at": preferences["updated_at"],
                "p_revision": row["revision"],
                "p_state": updated,
                "p_notice": notice,
            },
        )
        .execute()
        .data
    )
    return bool(committed and should_notify)


def delivery_allowed(user_id: str, payload: dict) -> bool:
    if settings.line_alert_shadow_mode or not in_canary(user_id):
        return False
    if payload.get("policy_version") != "nearest-pin-v1":
        return False  # Legacy station-wide alerts must not bypass the new selection.
    preferences, point, source = selected(user_id)
    return bool(
        source
        and point
        and preferences.get("consent_granted")
        and preferences.get("air_alerts", True)
        and point["version"] == payload.get("location_version")
        and preferences.get("updated_at") == payload.get("preferences_at")
        and source["source_type"] == payload.get("source_type")
        and source["source_id"] == payload.get("source_id")
        and timestamp(source["source_at"]) == timestamp(payload.get("source_at"))
        and source["pm25"] == payload.get("pm25")
        and source["pm25"] >= max(37.6, float(preferences.get("pm25_threshold", 37.6)))
    )


@storage_errors
def evaluate_batch(limit: int = 100) -> dict:
    """Oldest evaluated first; no full user scan or unstable offset cursor."""
    if settings.local_demo_mode:
        users = list(LOCATIONS)[:limit]
    else:
        users = (
            db.get_client()
            .rpc("due_air_alert_users", {"p_limit": limit})
            .execute()
            .data
            or []
        )
    sent = failed = 0
    for user in users:
        try:
            sent += int(evaluate(str(user)))
        except (ValueError, UpstreamError):
            failed += 1
    return {"evaluated": len(users), "queued": sent, "failed": failed}
