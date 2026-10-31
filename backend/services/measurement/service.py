"""Request lifecycle and fanout; all sensitive location decisions stay server-side."""

from __future__ import annotations

import hashlib
import logging
from datetime import UTC, datetime, timedelta, timezone
from time import monotonic
from uuid import NAMESPACE_URL, uuid4, uuid5

from ...algorithms.distance import haversine_km
from ...algorithms.measurement_requests import (
    eligible_helper,
    qualifying_report,
    request_window,
    timestamp,
)
from ...algorithms.trust import is_thailand_area
from ...core.config import settings
from .. import line_messaging
from .. import supabase_client as db
from ..community.presenter import present_report
from . import store

logger = logging.getLogger("clearpath.measurement")


def enabled() -> bool:
    return settings.local_demo_mode or settings.measurement_requests_enabled


def require_enabled():
    if not enabled():
        from ...core.errors import ConfigurationError

        raise ConfigurationError("ระบบขอค่าฝุ่นยังไม่เปิดใช้งาน")


def view(row: dict, viewer_id: str) -> dict:
    owner = row["user_id"] == viewer_id
    invitation = store.recipient(row["id"], viewer_id)
    if not owner and invitation is None:
        raise KeyError("ไม่พบคำขอ")
    result = None
    distance = None
    if row.get("result_report_id"):
        raw = db.get_community_report(row["result_report_id"])
        if raw and raw.get("status") == "approved":
            result = present_report(raw)
            # Never leak exact report location through a precise distance.
            distance = round(
                haversine_km(row["lat"], row["lon"], result["lat"], result["lon"]), 1
            )
    from ..community import xp

    return {
        key: row[key]
        for key in (
            "id",
            "place_name",
            "lat",
            "lon",
            "radius_km",
            "starts_at",
            "expires_at",
            "created_at",
            "status",
        )
    } | {
        "help_claim": xp.existing_claim(viewer_id, row) if not owner else None,
        "xp_enabled": xp.enabled(),
        "is_owner": owner,
        "recipient_count": len(store.recipients(row["id"])) if owner else 0,
        "declined": bool(invitation and invitation.get("declined")),
        "matched_location_at": invitation.get("matched_location_at")
        if invitation
        else None,
        "result": result,
        "result_distance_km": distance,
    }


def create(user_id: str, values: dict) -> dict:
    require_enabled()
    if not is_thailand_area(values["lat"], values["lon"]):
        raise ValueError("เลือกสถานที่ในประเทศไทย")
    if not values["place_name"].strip():
        raise ValueError("ระบุชื่อสถานที่")
    now = datetime.now(UTC)
    start, end = request_window(now, values.get("needed_by"))
    # Immediate duplicate clicks share a fingerprint independent of generated end time.
    schedule = (
        timestamp(values["needed_by"]).isoformat() if values.get("needed_by") else "now"
    )
    fingerprint = hashlib.sha256(
        f"{values['lat']:.5f}:{values['lon']:.5f}:{values['radius_km']}:{schedule}".encode()
    ).hexdigest()
    row = store.create(
        {
            "id": str(uuid4()),
            "user_id": user_id,
            "idempotency_key": str(values["idempotency_key"]),
            "fingerprint": fingerprint,
            "place_name": values["place_name"].strip(),
            "lat": values["lat"],
            "lon": values["lon"],
            "radius_km": values["radius_km"],
            "starts_at": start.isoformat(),
            "expires_at": end.isoformat(),
            "status": "active" if start <= now else "scheduled",
            "result_report_id": None,
            "dispatch_cursor": None,
            "last_processed_at": None,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }
    )
    return view(row, user_id)


def helper_settings(user_id: str, enabled_value: bool | None = None) -> dict:
    require_enabled()
    row = store.presence(
        user_id, {"enabled": enabled_value} if enabled_value is not None else None
    )
    return {"enabled": row.get("enabled", False), "observed_at": row.get("observed_at")}


def update_presence(user_id: str, values: dict) -> dict:
    require_enabled()
    now = datetime.now(UTC)
    observed = timestamp(values["observed_at"])
    if observed > now + timedelta(seconds=30) or observed < now - timedelta(minutes=2):
        raise ValueError("กรุณารับ GPS ใหม่จากอุปกรณ์")
    if not is_thailand_area(values["lat"], values["lon"]):
        raise ValueError("ขณะนี้รับตำแหน่งเฉพาะประเทศไทย")
    store.presence(user_id, {**values, "observed_at": observed.isoformat()})
    return helper_settings(user_id)


def cancel(request_id: str, user_id: str) -> dict:
    row = store.get(request_id)
    if not row or row["user_id"] != user_id:
        raise KeyError("ไม่พบคำขอ")
    store.finish(request_id, "cancelled")
    return view(store.get(request_id), user_id)


def decline(request_id: str, user_id: str) -> dict:
    if not store.recipient(request_id, user_id, True):
        raise KeyError("ไม่พบคำขอ")
    return view(store.get(request_id), user_id)


def notify(row: dict, user_id: str, kind: str, matched_location_at: str | None = None):
    now = datetime.now(UTC).isoformat()
    key = f"measurement:{row['id']}:{kind}:{user_id}"
    nid, oid = (
        str(uuid5(NAMESPACE_URL, f"{key}:{suffix}")) for suffix in ("inbox", "line")
    )
    expires = (
        timestamp(row["expires_at"])
        .astimezone(timezone(timedelta(hours=7)))
        .strftime("%d/%m %H:%M")
    )
    title = {
        "measurement_request": "ช่วยรายงานค่าฝุ่นบริเวณนี้ได้ไหม?",
        "measurement_fulfilled": "มีรายงานค่าฝุ่นที่คุณขอแล้ว",
        "measurement_expired": "คำขอค่าฝุ่นหมดเวลาแล้ว",
    }[kind]
    body = f"{row['place_name']} · วง {row['radius_km']} กม. · ก่อน {expires} น."
    if kind == "measurement_request":
        body += " · เลือกจากตำแหน่งเข้าเว็บล่าสุด ซึ่งอาจไม่ใช่ตำแหน่งปัจจุบัน"
    url = f"/requests/{row['id']}"
    notification = {
        "id": nid,
        "user_id": user_id,
        "event_type": kind,
        "title": title,
        "body": body,
        "url": url,
        "entity_type": "measurement_request",
        "entity_id": row["id"],
        "payload": {"matched_location_at": matched_location_at},
        "deduplication_key": key,
        "read_at": None,
        "created_at": now,
    }
    prefs = db.get_notification_preferences(user_id) or {}
    linked = (
        line_messaging.status(user_id).get("linked")
        if settings.line_messaging_ready
        else False
    )
    outbox = None
    if prefs.get("consent_granted") and prefs.get("line_enabled", True) and linked:
        outbox = {
            "id": oid,
            "user_id": user_id,
            "notification_id": nid,
            "event_key": f"{key}:line",
            "payload": {
                "channel": "line",
                "title": title,
                "body": body,
                "url": url,
                "tag": key,
                "measurement_request_id": row["id"],
                "measurement_kind": kind,
                "expires_at": row["expires_at"]
                if kind == "measurement_request"
                else (datetime.now(UTC) + timedelta(days=1)).isoformat(),
                "retry_key": oid,
            },
            "status": "pending",
            "attempts": 0,
            "next_attempt_at": now,
            "last_error": None,
            "processed_at": None,
            "created_at": now,
            "updated_at": now,
        }
    store.notify(notification, outbox)


def delivery_allowed(user_id: str, payload: dict) -> bool:
    if not enabled() or timestamp(payload["expires_at"]) <= datetime.now(UTC):
        return False
    prefs = db.get_notification_preferences(user_id) or {}
    if not prefs.get("consent_granted") or not prefs.get("line_enabled", True):
        return False
    row = store.get(payload["measurement_request_id"])
    if not row:
        return False
    if payload["measurement_kind"] == "measurement_request":
        invitation = store.recipient(row["id"], user_id)
        return bool(
            row["status"] == "active"
            and store.presence(user_id).get("enabled")
            and invitation
            and not invitation.get("declined")
        )
    return row["user_id"] == user_id and row["status"] in {"fulfilled", "expired"}


def process() -> dict:
    require_enabled()
    counters = {"processed": 0, "fulfilled": 0, "expired": 0, "failed": 0}
    deadline = monotonic() + 20
    for row in store.work_rows():
        if monotonic() >= deadline:
            break
        try:
            now = datetime.now(UTC)
            store.touch(row["id"], {"last_processed_at": now.isoformat()})
            if row["status"] in {"scheduled", "active"}:
                if timestamp(row["starts_at"]) > now:
                    continue
                if row["status"] == "scheduled":
                    store.activate(row)
                    row = store.get(row["id"])
                match = next(
                    (r for r in store.reports(row) if qualifying_report(row, r)), None
                )
                if match:
                    counters["fulfilled"] += store.finish(
                        row["id"], "fulfilled", match["id"]
                    )
                elif timestamp(row["expires_at"]) <= now:
                    counters["expired"] += store.finish(row["id"], "expired")
                else:
                    helpers = store.helpers(row)
                    cursor = row.get("dispatch_cursor")
                    completed_batch = True
                    for helper in helpers:
                        if monotonic() >= deadline:
                            completed_batch = False
                            break
                        if eligible_helper(row, helper) and not store.recipient(
                            row["id"], helper["user_id"]
                        ):
                            notify(
                                row,
                                helper["user_id"],
                                "measurement_request",
                                helper["observed_at"],
                            )
                        cursor = helper["user_id"]
                    store.touch(
                        row["id"],
                        {
                            "dispatch_cursor": None
                            if completed_batch and len(helpers) < 100
                            else cursor
                        },
                    )
            latest = store.get(row["id"])
            if latest["status"] in {"fulfilled", "expired"}:
                notify(latest, latest["user_id"], f"measurement_{latest['status']}")
            counters["processed"] += 1
        except Exception:
            counters["failed"] += 1
            logger.exception(
                "measurement_request_processing_failed", extra={"request_id": row["id"]}
            )
    logger.info("measurement_requests_processed", extra=counters)
    return counters
