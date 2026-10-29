"""Service-only persistence. Local demo mirrors transactional Supabase operations."""

from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime, timedelta, timezone
from threading import RLock

from ...core.config import settings
from ...core.errors import UpstreamError
from .. import supabase_client as db

_LOCK = RLock()
REQUESTS: dict[str, dict] = {}
PRESENCES: dict[str, dict] = {}
RECIPIENTS: dict[tuple[str, str], dict] = {}
NOTIFIED: set[str] = set()
LEASES: dict[str, datetime] = {}
PAGE = 250


def execute(operation):
    try:
        return operation()
    except (ValueError, UpstreamError):
        raise
    except Exception as exc:
        raise UpstreamError("ระบบขอค่าฝุ่นยังไม่พร้อม กรุณาลองอีกครั้ง") from exc


def rpc(name: str, params: dict):
    return execute(lambda: db.get_client().rpc(name, params).execute().data)


def pages(query):
    offset = 0
    while True:
        rows = (
            execute(
                lambda offset=offset: (
                    query().range(offset, offset + PAGE - 1).execute().data
                )
            )
            or []
        )
        yield from rows
        if len(rows) < PAGE:
            break
        offset += PAGE


def create(row: dict) -> dict:
    if not settings.local_demo_mode:
        result = rpc("create_measurement_request", {"p_row": row})
    else:
        with _LOCK:
            now = datetime.now(UTC)
            owned = [r for r in REQUESTS.values() if r["user_id"] == row["user_id"]]
            existing = next(
                (
                    r
                    for r in owned
                    if r["idempotency_key"] == row["idempotency_key"]
                    or (
                        r["fingerprint"] == row["fingerprint"]
                        and r["status"] in {"active", "scheduled"}
                        and r["expires_at"] > now.isoformat()
                    )
                ),
                None,
            )
            day = now.astimezone(timezone(timedelta(hours=7))).date()
            if existing:
                result = {"row": deepcopy(existing)}
            elif (
                sum(
                    datetime.fromisoformat(r["created_at"])
                    .astimezone(timezone(timedelta(hours=7)))
                    .date()
                    == day
                    for r in owned
                )
                >= 3
            ):
                result = {"error": "daily_limit"}
            elif (
                sum(
                    r["status"] in {"active", "scheduled"}
                    and r["expires_at"] > now.isoformat()
                    for r in owned
                )
                >= 2
            ):
                result = {"error": "active_limit"}
            else:
                REQUESTS[row["id"]] = deepcopy(row)
                result = {"row": deepcopy(row)}
    if result.get("error"):
        raise ValueError(
            "ขอได้ไม่เกิน 3 ครั้งต่อวัน"
            if result["error"] == "daily_limit"
            else "เปิดคำขอพร้อมกันได้ไม่เกิน 2 คำขอ"
        )
    return result["row"]


def get(request_id: str) -> dict | None:
    if settings.local_demo_mode:
        with _LOCK:
            return deepcopy(REQUESTS.get(request_id))
    rows = execute(
        lambda: (
            db.get_client()
            .table("measurement_requests")
            .select("*")
            .eq("id", request_id)
            .limit(1)
            .execute()
            .data
        )
    )
    return rows[0] if rows else None


def presence(user_id: str, values: dict | None = None) -> dict:
    if not settings.local_demo_mode:
        if values is not None:
            return (
                rpc("set_measurement_presence", {"p_user": user_id, "p_values": values})
                or {}
            )
        rows = execute(
            lambda: (
                db.get_client()
                .table("measurement_helper_presence")
                .select("*")
                .eq("user_id", user_id)
                .limit(1)
                .execute()
                .data
            )
        )
        return rows[0] if rows else {}
    with _LOCK:
        row = PRESENCES.setdefault(user_id, {"user_id": user_id, "enabled": False})
        now = datetime.now(UTC)
        if values is not None:
            if "enabled" in values:
                row["enabled"] = values["enabled"]
                if not values["enabled"]:
                    for key in ("lat", "lon", "accuracy_m", "observed_at"):
                        row[key] = None
                row["updated_at"] = now.isoformat()
            elif row["enabled"] and (
                not row.get("observed_at")
                or datetime.fromisoformat(row["updated_at"])
                <= now - timedelta(minutes=5)
            ):
                row.update(values, updated_at=now.isoformat())
        return deepcopy(row)


def recipient(request_id: str, user_id: str, decline: bool = False) -> dict | None:
    if settings.local_demo_mode:
        with _LOCK:
            row = RECIPIENTS.get((request_id, user_id))
            if row and decline:
                row["declined"] = True
            return deepcopy(row)
    query = db.get_client().table("measurement_request_recipients")
    query = query.update({"declined": True}) if decline else query.select("*")
    rows = execute(
        lambda: query.eq("request_id", request_id).eq("user_id", user_id).execute().data
    )
    return rows[0] if rows else None


def recipients(request_id: str) -> list[dict]:
    if settings.local_demo_mode:
        return [deepcopy(v) for (r, _u), v in RECIPIENTS.items() if r == request_id]
    return list(
        pages(
            lambda: (
                db.get_client()
                .table("measurement_request_recipients")
                .select("*")
                .eq("request_id", request_id)
                .order("user_id")
            )
        )
    )


def mine(user_id: str) -> list[dict]:
    if settings.local_demo_mode:
        return sorted(
            [
                deepcopy(r)
                for r in REQUESTS.values()
                if r["user_id"] == user_id or (r["id"], user_id) in RECIPIENTS
            ],
            key=lambda r: r["created_at"],
            reverse=True,
        )[:100]
    owned = (
        execute(
            lambda: (
                db.get_client()
                .table("measurement_requests")
                .select("*")
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .limit(100)
                .execute()
                .data
            )
        )
        or []
    )
    invites = (
        execute(
            lambda: (
                db.get_client()
                .table("measurement_request_recipients")
                .select("request_id")
                .eq("user_id", user_id)
                .order("created_at", desc=True)
                .limit(100)
                .execute()
                .data
            )
        )
        or []
    )
    invited = (
        execute(
            lambda: (
                db.get_client()
                .table("measurement_requests")
                .select("*")
                .in_("id", [r["request_id"] for r in invites])
                .execute()
                .data
            )
        )
        if invites
        else []
    )
    return sorted(
        {r["id"]: r for r in [*owned, *(invited or [])]}.values(),
        key=lambda r: r["created_at"],
        reverse=True,
    )[:100]


def touch(request_id: str, values: dict) -> None:
    if settings.local_demo_mode:
        with _LOCK:
            REQUESTS[request_id].update(values)
    else:
        execute(
            lambda: (
                db.get_client()
                .table("measurement_requests")
                .update(values)
                .eq("id", request_id)
                .execute()
            )
        )


def work_rows():
    # Bounded, fair batches. Every invocation revisits the least recently worked rows.
    now = datetime.now(UTC)
    if settings.local_demo_mode:
        rows = [
            deepcopy(r)
            for r in REQUESTS.values()
            if (
                r["status"] in {"active", "scheduled"}
                and datetime.fromisoformat(r["starts_at"]) <= now
            )
            or (
                r["status"] in {"fulfilled", "expired"}
                and datetime.fromisoformat(r["updated_at"]) >= now - timedelta(days=2)
            )
        ]
        return sorted(rows, key=lambda r: (r.get("last_processed_at") or "", r["id"]))[
            :50
        ]
    return (
        execute(
            lambda: (
                db.get_client()
                .table("measurement_requests")
                .select("*")
                .or_(
                    f"and(status.in.(active,scheduled),starts_at.lte.{now.isoformat()}),and(status.in.(fulfilled,expired),updated_at.gte.{(now - timedelta(days=2)).isoformat()})"
                )
                .order("last_processed_at", nullsfirst=True)
                .order("id")
                .limit(50)
                .execute()
                .data
            )
        )
        or []
    )


def helpers(row: dict):
    cursor = row.get("dispatch_cursor") or ""
    if settings.local_demo_mode:
        return sorted(
            [
                deepcopy(p)
                for p in PRESENCES.values()
                if p.get("enabled") and p["user_id"] > cursor
            ],
            key=lambda p: p["user_id"],
        )[:100]
    delta = row["radius_km"] / 110.0
    query = (
        db.get_client()
        .table("measurement_helper_presence")
        .select("*")
        .eq("enabled", True)
        .gte("lat", row["lat"] - delta)
        .lte("lat", row["lat"] + delta)
    )
    if cursor:
        query = query.gt("user_id", cursor)
    return execute(lambda: query.order("user_id").limit(100).execute().data) or []


def reports(row: dict):
    if settings.local_demo_mode:
        from .. import local_store

        yield from sorted(
            local_store.list_reports("approved", 100000),
            key=lambda r: (r.get("moderated_at") or "", r["id"]),
        )
    else:
        yield from pages(
            lambda: (
                db.get_client()
                .table("community_reports")
                .select(
                    "id,user_id,lat,lon,status,pm25,captured_at,created_at,moderated_at"
                )
                .eq("status", "approved")
                .gte("captured_at", row["starts_at"])
                .lte("captured_at", row["expires_at"])
                .gte("created_at", row["starts_at"])
                .lte("created_at", row["expires_at"])
                .order("moderated_at")
                .order("id")
            )
        )


def activate(row: dict) -> None:
    if settings.local_demo_mode:
        with _LOCK:
            if REQUESTS[row["id"]]["status"] == "scheduled":
                REQUESTS[row["id"]]["status"] = "active"
    else:
        execute(
            lambda: (
                db.get_client()
                .table("measurement_requests")
                .update({"status": "active"})
                .eq("id", row["id"])
                .eq("status", "scheduled")
                .execute()
            )
        )


def finish(request_id: str, status: str, report_id: str | None = None) -> bool:
    if not settings.local_demo_mode:
        return bool(
            rpc(
                "finish_measurement_request",
                {"p_id": request_id, "p_status": status, "p_report": report_id},
            )
        )
    with _LOCK:
        row = REQUESTS[request_id]
        if row["status"] not in {"scheduled", "active"}:
            return False
        row.update(
            status=status,
            result_report_id=report_id,
            updated_at=datetime.now(UTC).isoformat(),
        )
        from .. import local_store

        for notification in local_store._USER_NOTIFICATIONS.values():
            if (
                notification.get("entity_id") == request_id
                and notification.get("event_type") == "measurement_request"
            ):
                notification.update(title="คำขอสิ้นสุดแล้ว", body="เปิดดูสถานะล่าสุดของคำขอ")
        return True


def notify(notification: dict, outbox: dict | None) -> bool:
    if not settings.local_demo_mode:
        return bool(
            rpc(
                "notify_measurement_request",
                {"p_notification": notification, "p_outbox": outbox},
            )
        )
    from .. import local_store

    with _LOCK:
        row = REQUESTS[notification["entity_id"]]
        uid = notification["user_id"]
        if notification["event_type"] == "measurement_request":
            if (
                row["status"] != "active"
                or datetime.fromisoformat(row["expires_at"]) <= datetime.now(UTC)
                or not PRESENCES.get(uid, {}).get("enabled")
            ):
                return False
            existing = RECIPIENTS.get((row["id"], uid))
            if existing and existing["declined"]:
                return False
            RECIPIENTS.setdefault(
                (row["id"], uid),
                {
                    "request_id": row["id"],
                    "user_id": uid,
                    "matched_location_at": notification["payload"][
                        "matched_location_at"
                    ],
                    "declined": False,
                },
            )
        key = notification["deduplication_key"]
        if key not in NOTIFIED:
            local_store.create_user_notification(notification)
            if outbox:
                local_store.create_outbox_event(outbox)
            NOTIFIED.add(key)
        return True


def claim_delivery(event_id: str) -> bool:
    if not settings.local_demo_mode:
        return bool(rpc("claim_measurement_delivery", {"p_event": event_id}))
    with _LOCK:
        now = datetime.now(UTC)
        if LEASES.get(event_id, now - timedelta(seconds=1)) >= now:
            return False
        LEASES[event_id] = now + timedelta(minutes=2)
        return True
