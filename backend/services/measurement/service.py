"""Request lifecycle and fanout; all sensitive location decisions stay server-side."""

from __future__ import annotations

import hashlib
import logging
from datetime import UTC, datetime, timedelta, timezone
from time import monotonic
from uuid import NAMESPACE_URL, uuid5

from backend.services import store_client

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
from ..record_keys import creation_key
from . import registered, store

logger = logging.getLogger("clearpath.measurement")


def enabled() -> bool:
    return settings.local_demo_mode or settings.measurement_requests_enabled


def require_enabled():
    if not enabled():
        from ...core.errors import ConfigurationError

        raise ConfigurationError("ระบบขอค่าฝุ่นยังไม่เปิดใช้งาน")


def requester_names(rows: list[dict]) -> dict[str, str]:
    """Resolve chosen public names once per list; never serialize owner IDs/emails."""
    ids = list({str(row["user_id"]) for row in rows})
    if not ids:
        return {}
    try:
        if settings.local_demo_mode:
            from .. import local_store
            from ..community import xp

            profiles = [local_store.get_existing_profile(uid) for uid in ids]
            accounts = (
                [dict(xp.account(uid), user_id=uid) for uid in ids]
                if xp.enabled()
                else []
            )
        else:
            client = store_client.get_client()
            profiles = (
                client.table("profiles")
                .select("id,display_name")
                .in_("id", ids)
                .execute()
                .data
                or []
            )
            accounts = (
                client.table("community_xp_accounts")
                .select("user_id,alias,identity_mode")
                .in_("user_id", ids)
                .execute()
                .data
                or []
            )
        preferences = {str(account["user_id"]): account for account in accounts}
        names = {}
        for profile in profiles:
            uid = str(profile["id"])
            preference = preferences.get(uid, {})
            names[uid] = (
                preference.get("alias")
                if preference.get("identity_mode") == "alias"
                else profile.get("display_name")
            ) or "สมาชิก ClearPath"
        return names
    except Exception:
        # An unavailable privacy preference must not expose a Google name.
        logger.warning("measurement_requester_names_unavailable")
        return {}


def listing(user_id: str) -> dict:
    from ..community import xp

    rows = store.visible(user_id)
    names = requester_names(rows)
    context = store.view_context(rows, user_id, xp_enabled=xp.enabled())
    context["identities"] = xp.public_identities(
        [
            row
            for row in context["reports"].values()
            if row and row.get("status") == "approved"
        ]
    )
    return {
        "requests": [view(row, user_id, names=names, context=context) for row in rows]
    }


def view(
    row: dict,
    viewer_id: str,
    *,
    names: dict[str, str] | None = None,
    context: dict | None = None,
) -> dict:
    owner = row["user_id"] == viewer_id
    invitation = (
        context["invitations"].get(str(row["id"]))
        if context is not None
        else store.recipient(row["id"], viewer_id)
    )
    from ..community import xp

    claim = (
        (
            xp.present_claim(row, context["claims"].get(str(row["id"])))
            if context is not None
            else xp.existing_claim(viewer_id, row)
        )
        if not owner
        else None
    )
    if not owner and invitation is None and claim is None and not store.is_open(row):
        raise KeyError("ไม่พบคำขอ")
    result = None
    distance = None
    if row.get("result_report_id"):
        raw = (
            context["reports"].get(str(row["result_report_id"]))
            if context is not None
            else db.get_community_report(row["result_report_id"])
        )
        if raw and raw.get("status") == "approved":
            result = present_report(
                raw, identities=context["identities"] if context is not None else None
            )
            # Never leak exact report location through a precise distance.
            distance = round(
                haversine_km(row["lat"], row["lon"], result["lat"], result["lon"]), 1
            )
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
        "requester_name": (names if names is not None else requester_names([row])).get(
            str(row["user_id"]), "สมาชิก ClearPath"
        ),
        "help_claim": claim,
        "xp_enabled": context["xp_enabled"] if context is not None else xp.enabled(),
        "automatic_help_enabled": registered.enabled(),
        "is_owner": owner,
        "recipient_count": (
            context["counts"].get(str(row["id"]), 0)
            if context is not None
            else len(store.recipients(row["id"]))
        )
        if owner
        else 0,
        "declined": bool(invitation and invitation.get("declined")),
        "matched_location_at": invitation.get("matched_location_at")
        if invitation
        else None,
        "matched_location_source": invitation.get("matched_source", "gps")
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
            "id": creation_key("measurement_requests"),
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
    saved = registered.locations(user_id) if registered.enabled() else []
    if registered.enabled() and enabled_value and not any(p["enabled"] for p in saved):
        raise ValueError("เพิ่มพื้นที่รับคำขออย่างน้อย 1 จุดก่อนเปิดรับ")
    row = store.presence(
        user_id, {"enabled": enabled_value} if enabled_value is not None else None
    )
    return {
        "enabled": row.get("enabled", False),
        "observed_at": None if registered.enabled() else row.get("observed_at"),
        "registered_locations_enabled": registered.enabled(),
        "locations": saved,
    }


def update_presence(user_id: str, values: dict) -> dict:
    require_enabled()
    if registered.enabled():
        return helper_settings(user_id)
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
    if kind == "measurement_request" and registered.enabled():
        return registered.invite(row, user_id)
    now = datetime.now(UTC).isoformat()
    request_key = row.get("legacy_id") or row["id"]
    account_key = db.stable_identifier("profiles", user_id)
    key = f"measurement:{request_key}:{kind}:{account_key}"
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
        if registered.enabled():
            return False
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
    registered_mode = registered.enabled()
    reconciled = registered.process_matches() if registered_mode else {}
    counters = {
        "processed": 0,
        "fulfilled": reconciled.get("matched", 0),
        "expired": 0,
        "failed": 0,
    }
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
                match = (
                    None
                    if registered_mode
                    else next(
                        (r for r in store.reports(row) if qualifying_report(row, r)),
                        None,
                    )
                )
                if match:
                    counters["fulfilled"] += store.finish(
                        row["id"], "fulfilled", match["id"]
                    )
                elif timestamp(row["expires_at"]) <= now:
                    counters["expired"] += store.finish(row["id"], "expired")
                else:
                    helpers = (
                        registered.helpers(row)
                        if registered_mode
                        else store.helpers(row)
                    )
                    cursor = row.get("dispatch_cursor")
                    completed_batch = True
                    for helper in helpers:
                        if monotonic() >= deadline:
                            completed_batch = False
                            break
                        if (
                            registered_mode or eligible_helper(row, helper)
                        ) and not store.recipient(row["id"], helper["user_id"]):
                            notify(
                                row,
                                helper["user_id"],
                                "measurement_request",
                                helper.get("observed_at"),
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
