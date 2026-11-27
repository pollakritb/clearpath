"""All nearby alerting observations, private last GPS and atomic batch persistence."""

from __future__ import annotations

import logging
from contextlib import suppress
from datetime import UTC, datetime
from functools import wraps
from threading import RLock
from uuid import uuid4

from ..algorithms.nearby_air_alert import POLICY_VERSION, alert_sources, observation_key
from ..algorithms.nearest_air_alert import (
    ALERT_RADIUS_KM,
    alert_day,
    alert_severity,
    level_enabled,
    nearest_source,
    timestamp,
    valid_location,
)
from ..algorithms.notification_policy import BANGKOK_TZ, air_quality_level
from ..core.config import settings
from ..core.errors import ConfigurationError, UpstreamError
from ..core.identifiers import code, number
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
    if not preferences.get("air_alerts", True):
        raise ValueError("เปิดการแจ้งเตือนก่อนใช้ตำแหน่ง")
    # Browser permission supplies the valid foreground GPS sample. Keep the
    # legacy record without asking the user for a second consent checkbox.
    if not preferences.get("consent_granted"):
        supabase_client.upsert_notification_preferences(
            user_id,
            {"consent_granted": True, "consent_granted_at": now.isoformat()},
        )
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
                "air_alert_candidates_for_user",
                {
                    "p_user": point["user_id"],
                    "p_lat": point["lat"],
                    "p_lon": point["lon"],
                    "p_radius": radius,
                },
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
        if str(r.get("user_id")) == str(point.get("user_id")):
            continue
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
    radius = ALERT_RADIUS_KM
    return (
        preferences,
        point,
        nearest_source(
            point, candidates({**point, "user_id": user_id}, radius), radius, now
        ),
    )


def selected_sources(
    user_id: str, now: datetime | None = None
) -> tuple[dict, dict | None, list[dict]]:
    now = now or datetime.now(UTC)
    preferences = supabase_client.get_notification_preferences(user_id) or {}
    point = location(user_id)
    if not valid_location(point, now):
        return preferences, point, []
    return (
        preferences,
        point,
        alert_sources(
            point,
            candidates({**point, "user_id": user_id}, ALERT_RADIUS_KM),
            preferences,
            now,
        ),
    )


def notice_for(source: dict, point: dict, preferences: dict, key: str) -> dict:
    kind = source["source_type"]
    origin = "สถานี Air4Thai" if kind == "station" else "รายงานชุมชน"
    level = air_quality_level(source["pm25"])
    value = format(float(source["pm25"]), "g")
    source_time = (
        timestamp(source["source_at"]).astimezone(BANGKOK_TZ).strftime("%d/%m/%Y %H:%M")
    )
    name = str(source.get("name") or "") if kind == "station" else ""
    pin_id = str(source["source_id"])
    if kind == "community":
        with suppress(ValueError):
            pin_id = code("community_reports", pin_id)
    distance = float(source["distance_km"])
    distance_label = (
        f"{round(distance * 1000):,} เมตร" if distance < 1 else f"{distance:.1f} กม."
    )
    severity = alert_severity(source["pm25"])
    band = "75.1 µg/m³ ขึ้นไป" if severity == 2 else "37.6–75.0 µg/m³"
    title = f"PM2.5 {value} µg/m³ · {level['label']}"
    body = (
        f"ระดับแจ้งเตือน: {band} ({level['label']})\n"
        f"แหล่งข้อมูล: {origin}{' · ' + name if name else ''}\n"
        f"หมุดอ้างอิง: {pin_id}\n"
        f"ระยะห่าง: ประมาณ {distance_label} จาก GPS ล่าสุดของคุณ\n"
        f"วัดเมื่อ: {source_time} น. (เวลาไทย)\n"
        "แจ้งทุกหมุดที่ถึงระดับที่เปิดไว้ภายใน 2 กม. จาก GPS ล่าสุด ไม่ใช่ค่าฝุ่นทุกจุดในพื้นที่\n\n"
        f"คำแนะนำ: {level['advice']}"
    )
    if kind == "community":
        body += "\nข้อมูลชุมชนเป็นข้อมูลเสริม ใช้พิกัดสาธารณะ ระยะห่างจึงเป็นค่าประมาณ"
    observed = timestamp(point.get("observed_at"))
    if observed:
        body += (
            "\nGPS อ้างอิงที่บันทึก: "
            + observed.astimezone(BANGKOK_TZ).strftime("%d/%m/%Y %H:%M")
            + " น. (เวลาไทย)"
        )
    body += "\nไม่จำกัดจำนวนต่อวัน · ค่าตรวจวัดเดิมของหมุดเดิมไม่แจ้งซ้ำ"
    return {
        "title": title,
        "body": body,
        "url": f"/?{'station' if kind == 'station' else 'report'}={pin_id}",
        "deduplication_key": key,
        "payload": {
            **source,
            "policy_version": POLICY_VERSION,
            "alert_day": alert_day(datetime.now(UTC)),
            "alert_severity": severity,
            "location_version": point["version"],
            "preferences_at": preferences.get("updated_at"),
        },
    }


AUDIENCE_POLICY = "exclude-own-v1"


def episode_for_other_reports(user_id: str, state: dict) -> dict:
    """One-time, evidence-bound upgrade; existing valid episodes are preserved."""
    if state.get("audience_policy") == AUDIENCE_POLICY:
        return state
    updated = dict(state)
    last = timestamp(state.get("last_notified_at"))
    if state.get("severity") and last and not settings.local_demo_mode:
        was_own = (
            db.get_client()
            .rpc(
                "air_alert_previous_was_own",
                {
                    "p_user": user_id,
                    "p_last": last.isoformat(),
                },
            )
            .execute()
            .data
        )
        if was_own is True:
            for field in ("severity", "last_notified_at", "low_since"):
                updated.pop(field, None)
    updated["audience_policy"] = AUDIENCE_POLICY
    return updated


def daily_severity(user_id: str, now: datetime) -> int:
    day = alert_day(now)
    if settings.local_demo_mode:
        notices = local_store.list_user_notifications(user_id, 100000)
        return max(
            (
                int(n.get("payload", {}).get("alert_severity", 0))
                for n in notices
                if n.get("event_type") == "air_alert"
                and n.get("payload", {}).get("alert_day") == day
            ),
            default=0,
        )
    rows = (
        db.get_client()
        .table("air_alert_daily_limits")
        .select("severity")
        .eq("user_id", user_id)
        .eq("alert_date", day)
        .execute()
        .data
        or []
    )
    return max((int(r["severity"]) for r in rows), default=0)


def daily_state(user_id: str, state: dict, now: datetime) -> dict:
    daily = daily_severity(user_id, now)
    if not daily:
        return state
    previous = (
        int(state.get("severity") or 0)
        if state.get("alert_day") == alert_day(now)
        else 0
    )
    return {**state, "alert_day": alert_day(now), "severity": max(previous, daily)}


@storage_errors
def evaluate(user_id: str) -> int:
    now = datetime.now(UTC)
    preferences, point, sources = selected_sources(user_id, now)
    if (
        not preferences.get("air_alerts", True)
        or not preferences.get("consent_granted")
        or not valid_location(point, now)
    ):
        return 0
    if settings.line_alert_shadow_mode or not in_canary(user_id):
        logger.info("air_alert_shadow eligible_sources=%s", len(sources))
        if not settings.local_demo_mode:
            db.get_client().table("air_alert_states").update(
                {"evaluated_at": now.isoformat(), "evaluation_lease_until": None}
            ).eq("user_id", user_id).execute()
        return 0
    recipient = user_id
    with suppress(ValueError):
        recipient = str(number("profiles", user_id))
    notices = [
        notice_for(source, point, preferences, f"{observation_key(source)}:{recipient}")
        for source in sources
    ]
    if settings.local_demo_mode:
        from .notifications import enqueue_user_notification

        with _LOCK:
            current = location(user_id)
            if not current or current["version"] != point["version"]:
                return 0
            previous = STATES.get(user_id, {"revision": 0, "state": {}})
            # Longer than the longest eligible source age; no daily quota/state reset.
            seen = {
                key: at
                for key, at in previous["state"].get("observations", {}).items()
                if timestamp(at) and (now - timestamp(at)).total_seconds() <= 10800
            }
            sent = 0
            for notice in notices:
                key = notice["deduplication_key"]
                if key in seen or local_store.has_user_notification(user_id, key):
                    continue
                enqueue_user_notification(
                    user_id=user_id, event_type="air_alert", **notice
                )
                seen[key] = notice["payload"]["source_at"]
                sent += 1
            STATES[user_id] = {
                "revision": previous["revision"] + 1,
                "state": {"policy_version": POLICY_VERSION, "observations": seen},
            }
            return sent
    result = (
        db.get_client()
        .rpc(
            "commit_nearby_air_alerts",
            {
                "p_user": user_id,
                "p_location_version": point["version"],
                "p_preferences_at": preferences["updated_at"],
                "p_notices": notices,
            },
        )
        .execute()
        .data
    )
    return int(result or 0)


def delivery_allowed(user_id: str, payload: dict) -> bool:
    if settings.line_alert_shadow_mode or not in_canary(user_id):
        return False
    if payload.get("policy_version") != POLICY_VERSION:
        return False
    preferences, point, sources = selected_sources(user_id)
    return bool(
        point
        and preferences.get("consent_granted")
        and preferences.get("air_alerts", True)
        and level_enabled(preferences, alert_severity(payload.get("pm25")))
        and point["version"] == payload.get("location_version")
        and preferences.get("updated_at") == payload.get("preferences_at")
        and any(
            source["source_type"] == payload.get("source_type")
            and str(source["source_id"]) == str(payload.get("source_id"))
            and timestamp(source["source_at"]) == timestamp(payload.get("source_at"))
            and source["pm25"] == payload.get("pm25")
            and payload.get("alert_severity") == alert_severity(source["pm25"])
            for source in sources
        )
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
