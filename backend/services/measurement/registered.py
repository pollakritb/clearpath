"""Private saved areas, grouped invitations and durable report reconciliation."""

from __future__ import annotations

from copy import deepcopy
from datetime import UTC, datetime, timedelta
from time import monotonic
from uuid import uuid4

from ...algorithms.measurement_requests import (
    eligible_registered_helper,
    qualifying_report,
)
from ...algorithms.trust import is_thailand_area
from ...core.config import settings
from ...core.errors import ConfigurationError
from ...models.measurement import MeasurementHelperLocationWrite
from .. import local_store
from .. import supabase_client as db
from . import store

LOCATIONS: dict[tuple[str, int], dict] = {}
BATCHES: dict[str, dict] = {}
JOBS: dict[str, dict] = {}
MATCHES: dict[str, list[str]] = {}
_CONTROL: tuple[str, float, bool] | None = None


def enabled() -> bool:
    global _CONTROL
    if not settings.measurement_registered_locations_enabled:
        return False
    if settings.local_demo_mode:
        return True
    key = settings.supabase_url
    if _CONTROL and _CONTROL[0] == key and monotonic() - _CONTROL[1] < 2:
        return _CONTROL[2]
    rows = (
        store.execute(
            lambda: (
                db.get_client()
                .table("measurement_request_control")
                .select("registered_enabled")
                .limit(1)
                .execute()
                .data
            )
        )
        or []
    )
    value = bool(rows and rows[0]["registered_enabled"])
    _CONTROL = (key, monotonic(), value)
    return value


def require_enabled():
    if not enabled():
        raise ConfigurationError("ระบบพื้นที่รับคำขอยังไม่เปิดใช้งาน")


def locations(user_id: str) -> list[dict]:
    if settings.local_demo_mode:
        with store._LOCK:
            return [
                deepcopy(row)
                for (uid, _), row in sorted(LOCATIONS.items())
                if uid == user_id
            ]
    return (
        store.execute(
            lambda: (
                db.get_client()
                .table("measurement_helper_locations")
                .select("slot,name,emoji,address,lat,lon,enabled")
                .eq("user_id", user_id)
                .order("slot")
                .execute()
                .data
            )
        )
        or []
    )


def save_location(user_id: str, values: dict, slot: int | None = None) -> dict:
    require_enabled()
    values = MeasurementHelperLocationWrite.model_validate(values).model_dump()
    if not is_thailand_area(values["lat"], values["lon"]):
        raise ValueError("เลือกพื้นที่ในประเทศไทย")
    if not settings.local_demo_mode:
        try:
            return store.rpc(
                "save_measurement_helper_location",
                dict(
                    p_user=user_id,
                    p_slot=slot,
                    p_values=values,
                    p_existing=slot is not None,
                ),
            )
        except Exception as exc:
            cause = exc
            while cause.__cause__ is not None:
                cause = cause.__cause__
            message = str(getattr(cause, "message", cause))
            if "location_limit" in message:
                raise ValueError("ลงทะเบียนได้สูงสุด 2 จุด ลบหรือแก้ไขจุดเดิมก่อน") from exc
            if "location_not_found" in message:
                raise KeyError("ไม่พบพื้นที่") from exc
            raise
    with store._LOCK:
        if slot is None:
            slot = next(
                (
                    s
                    for (uid, s), place in LOCATIONS.items()
                    if uid == user_id
                    and all(
                        place[k] == values[k] for k in ("name", "address", "lat", "lon")
                    )
                ),
                None,
            )
            slot = slot or next(
                (s for s in (1, 2) if (user_id, s) not in LOCATIONS), None
            )
            if slot is None:
                raise ValueError("ลงทะเบียนได้สูงสุด 2 จุด ลบหรือแก้ไขจุดเดิมก่อน")
        elif (user_id, slot) not in LOCATIONS:
            raise KeyError("ไม่พบพื้นที่")
        LOCATIONS[(user_id, slot)] = {**values, "slot": slot}
        for request in store.REQUESTS.values():
            request["dispatch_cursor"] = None
        return deepcopy(LOCATIONS[(user_id, slot)])


def delete_location(user_id: str, slot: int) -> None:
    require_enabled()
    if settings.local_demo_mode:
        with store._LOCK:
            if LOCATIONS.pop((user_id, slot), None) is None:
                raise KeyError("ไม่พบพื้นที่")
    else:
        rows = store.execute(
            lambda: (
                db.get_client()
                .table("measurement_helper_locations")
                .delete()
                .eq("user_id", user_id)
                .eq("slot", slot)
                .execute()
                .data
            )
        )
        if not rows:
            raise KeyError("ไม่พบพื้นที่")
    if not any(p["enabled"] for p in locations(user_id)):
        store.presence(user_id, {"enabled": False})


def helpers(request: dict) -> list[dict]:
    if not settings.local_demo_mode:
        return (
            store.rpc(
                "registered_measurement_helpers",
                dict(p_request=request["id"], p_cursor=request.get("dispatch_cursor")),
            )
            or []
        )
    with store._LOCK:
        return [
            dict(user_id=uid)
            for uid in sorted(store.PRESENCES)
            if uid > (request.get("dispatch_cursor") or "")
            and eligible_registered_helper(
                request, dict(store.PRESENCES[uid], locations=locations(uid))
            )
        ][:100]


def line_allowed(user_id: str) -> bool:
    from .. import line_messaging

    preferences = db.get_notification_preferences(user_id) or {}
    return bool(
        preferences.get("consent_granted")
        and preferences.get("line_enabled", True)
        and settings.line_messaging_ready
        and line_messaging.status(user_id).get("linked")
    )


def invite(request: dict, user_id: str) -> bool:
    line = line_allowed(user_id)
    if not settings.local_demo_mode:
        return bool(
            store.rpc(
                "queue_measurement_group",
                dict(p_request=request["id"], p_user=user_id, p_line=line),
            )
        )
    now = datetime.now(UTC)
    with store._LOCK:
        if not store.is_open(request) or not eligible_registered_helper(
            request,
            dict(
                store.PRESENCES.get(user_id, {}),
                user_id=user_id,
                locations=locations(user_id),
            ),
        ):
            return False
        recipient = store.RECIPIENTS.get((request["id"], user_id))
        if recipient:
            return False
        batch = next(
            (
                b
                for b in BATCHES.values()
                if b["user_id"] == user_id and b["closes_at"] > now
            ),
            None,
        )
        if batch is None:
            bid = str(uuid4())
            batch = dict(
                id=bid,
                user_id=user_id,
                closes_at=now + timedelta(seconds=60),
                requests=[],
                notification_id=str(uuid4()),
            )
            BATCHES[bid] = batch
        batch["requests"].append(request["id"])
        store.RECIPIENTS[(request["id"], user_id)] = dict(
            request_id=request["id"],
            user_id=user_id,
            matched_location_at=now.isoformat(),
            matched_source="registered",
            declined=False,
        )
        notification = dict(
            id=batch["notification_id"],
            user_id=user_id,
            event_type="measurement_request",
            title="มีคำขอให้ช่วยวัดค่าฝุ่น",
            body=f"{len(batch['requests'])} คำขอใกล้พื้นที่ที่บันทึกไว้",
            url=f"/requests?group={batch['id']}",
            entity_type="measurement_request_group",
            entity_id=batch["id"],
            payload={
                "measurement_group_id": batch["id"],
                "request_count": len(batch["requests"]),
            },
            deduplication_key=f"measurement-group:{batch['id']}",
            created_at=now.isoformat(),
            read_at=None,
        )
        # Update the same inbox item as the one-minute group grows.
        local_store._USER_NOTIFICATIONS[batch["notification_id"]] = notification
        if line:
            db.create_outbox_event(
                dict(
                    id=batch["id"],
                    user_id=user_id,
                    notification_id=batch["notification_id"],
                    event_key=f"measurement-group:{batch['id']}:line",
                    payload=dict(
                        channel="line",
                        event_type="measurement_request",
                        measurement_group_id=batch["id"],
                        tag=f"measurement-group:{batch['id']}",
                        retry_key=batch["id"],
                    ),
                    status="pending",
                    attempts=0,
                    next_attempt_at=batch["closes_at"].isoformat(),
                    created_at=now.isoformat(),
                )
            )
        return True


def prepare_group(batch_id: str, user_id: str) -> dict | None:
    if not enabled():
        return None
    if not settings.local_demo_mode:
        return store.rpc(
            "prepare_measurement_group", dict(p_batch=batch_id, p_user=user_id)
        )
    with store._LOCK:
        batch = BATCHES.get(batch_id)
        if not batch or batch["user_id"] != user_id:
            return None
        requests = [
            r
            for rid in batch["requests"]
            if (r := store.get(rid))
            and r["status"] == "active"
            and store.is_open(r)
            and not (store.recipient(rid, user_id) or {}).get("declined")
            and eligible_registered_helper(
                r,
                dict(
                    store.PRESENCES.get(user_id, {}),
                    user_id=user_id,
                    locations=locations(user_id),
                ),
            )
        ]
        count = len(requests)
        notification = local_store._USER_NOTIFICATIONS.get(batch["notification_id"])
        if notification:
            notification["body"] = (
                f"{count} คำขอใกล้พื้นที่ที่บันทึกไว้" if count else "เปิดดูสถานะล่าสุดของคำขอ"
            )
            notification["payload"]["request_count"] = count
            if not count:
                notification["title"] = "คำขอในกลุ่มนี้สิ้นสุดแล้ว"
        return (
            dict(
                title="ช่วยรายงานค่าฝุ่นบริเวณนี้ได้ไหม?",
                body=f"{count} คำขอใกล้พื้นที่ที่บันทึกไว้",
                url=f"/requests?group={batch_id}",
                request_ids=[r["id"] for r in requests],
            )
            if count
            else None
        )


def group_requests(batch_id: str, user_id: str) -> list[dict]:
    if settings.local_demo_mode:
        batch = BATCHES.get(batch_id)
        if not batch or batch["user_id"] != user_id:
            raise KeyError("ไม่พบกลุ่มคำขอ")
        return [r for rid in batch["requests"] if (r := store.get(rid))]
    batches = store.execute(
        lambda: (
            db.get_client()
            .table("measurement_notification_batches")
            .select("id")
            .eq("id", batch_id)
            .eq("user_id", user_id)
            .execute()
            .data
        )
    )
    if not batches:
        raise KeyError("ไม่พบกลุ่มคำขอ")
    items = list(
        store.pages(
            lambda: (
                db.get_client()
                .table("measurement_notification_batch_items")
                .select("request_id")
                .eq("batch_id", batch_id)
                .eq("user_id", user_id)
                .order("request_id")
            )
        )
    )
    rows = []
    for offset in range(0, len(items), store.PAGE):
        ids = [item["request_id"] for item in items[offset : offset + store.PAGE]]
        rows.extend(
            store.pages(
                lambda ids=ids: (
                    db.get_client()
                    .table("measurement_requests")
                    .select("*")
                    .in_("id", ids)
                    .order("id")
                )
            )
        )
    return rows


def process_matches() -> dict:
    if not settings.local_demo_mode:
        return store.rpc("process_measurement_report_jobs", {"p_limit": 50})
    processed = matched = 0
    with store._LOCK:
        for report in local_store.list_reports("approved", 100000):
            JOBS.setdefault(report["id"], dict(state="pending", matched_count=0))
            job = JOBS[report["id"]]
            if job["state"] == "done":
                continue
            count = 0
            for row in sorted(store.REQUESTS.values(), key=lambda row: row["id"]):
                if (
                    row["status"] in {"active", "scheduled"}
                    and qualifying_report(row, report, allow_self=True)
                    and store.finish(row["id"], "fulfilled", report["id"])
                ):
                    MATCHES.setdefault(report["id"], []).append(row["id"])
                    count += 1
            job.update(state="done", matched_count=count)
            matched += count
            processed += 1
    return dict(processed=processed, matched=matched)


def match_count(report_id: str) -> int:
    if settings.local_demo_mode:
        return len(MATCHES.get(report_id, []))
    rows = (
        store.execute(
            lambda: (
                db.get_client()
                .table("measurement_report_jobs")
                .select("matched_count")
                .eq("report_id", report_id)
                .execute()
                .data
            )
        )
        or []
    )
    return rows[0]["matched_count"] if rows else 0
