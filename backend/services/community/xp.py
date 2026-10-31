"""XP persistence and orchestration, separate from moderation and Trust."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from threading import RLock
from time import monotonic
from uuid import uuid4

from ...algorithms.community_xp import (
    POLICY_VERSION,
    REASONS,
    achievements,
    base_eligibility,
    help_eligibility,
    rank_progress,
    stamp,
    thai_day,
)
from ...core.config import settings
from ...core.errors import ConfigurationError, UpstreamError
from .. import supabase_client as db

logger = logging.getLogger("clearpath.xp")
_LOCK = RLock()
_ACCOUNTS: dict[str, dict] = {}
_EVENTS: list[dict] = []
_CLAIMS: dict[tuple[str, str], dict] = {}


def configured() -> bool:
    return settings.local_demo_mode or settings.community_xp_enabled


def enabled() -> bool:
    if settings.local_demo_mode:
        return True
    if not settings.community_xp_enabled:
        return False
    try:
        return bool(control()["enabled"])
    except UpstreamError:
        return False


def rpc(name: str, params: dict):
    try:
        return db.get_client().rpc(name, params).execute().data
    except Exception as exc:
        if getattr(exc, "message", "") in {
            "request_closed",
            "not_invited",
            "xp_disabled",
        }:
            raise ValueError("คำขอนี้ไม่เปิดรับผู้ช่วยใหม่") from exc
        raise UpstreamError("ระบบคะแนนยังไม่พร้อม กรุณาลองอีกครั้ง") from exc


def account(user_id: str) -> dict:
    if not enabled():
        raise ConfigurationError("ระบบคะแนนยังไม่เปิดใช้งาน")
    if settings.local_demo_mode:
        with _LOCK:
            if user_id not in _ACCOUNTS:
                member_id = str(uuid4())
                _ACCOUNTS[user_id] = dict(
                    user_id=user_id,
                    member_id=member_id,
                    alias=f"สมาชิก CP-{member_id[:8].upper()}",
                    hidden=False,
                )
            return dict(_ACCOUNTS[user_id])
    try:
        client = db.get_client()
        client.table("community_xp_accounts").upsert(
            {"user_id": user_id}, on_conflict="user_id", ignore_duplicates=True
        ).execute()
        return (
            client.table("community_xp_accounts")
            .select("*")
            .eq("user_id", user_id)
            .single()
            .execute()
            .data
        )
    except Exception as exc:
        raise UpstreamError("โหลดบัญชีคะแนนไม่สำเร็จ") from exc


def events(user_id: str, offset: int = 0, limit: int = 50) -> list[dict]:
    if settings.local_demo_mode:
        return sorted(
            [e for e in _EVENTS if e["user_id"] == user_id],
            key=lambda e: e["recorded_at"],
            reverse=True,
        )[offset : offset + limit]
    try:
        return (
            db.get_client()
            .table("community_xp_events")
            .select("*")
            .eq("user_id", user_id)
            .order("recorded_at", desc=True)
            .order("id")
            .range(offset, offset + limit - 1)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        raise UpstreamError("โหลดประวัติคะแนนไม่สำเร็จ") from exc


def totals(user_id: str) -> dict:
    if not settings.local_demo_mode:
        try:
            rows = (
                db.get_client()
                .rpc("community_xp_totals", {"p_user": user_id})
                .execute()
                .data
            )
            return rows[0] if rows else {}
        except Exception as exc:
            raise UpstreamError("โหลดคะแนนไม่สำเร็จ") from exc
    live = [
        e
        for e in _EVENTS
        if e["user_id"] == user_id
        and e["points"] > 0
        and not any(r.get("reverses") == e["id"] for r in _EVENTS)
    ]
    quota = [e for e in _EVENTS if e["user_id"] == user_id and e["points"] > 0]
    now = datetime.now(UTC)
    return dict(
        lifetime_xp=sum(e["points"] for e in live),
        days=len({thai_day(e["occurred_at"]) for e in live}),
        reports=sum(e["kind"] == "report" for e in live),
        helped=sum(e["kind"] == "help" for e in live),
        today_reports=sum(
            e["kind"] == "report" and thai_day(e["occurred_at"]) == thai_day(now)
            for e in quota
        ),
        today_help=sum(
            e["kind"] == "help" and thai_day(e["occurred_at"]) == thai_day(now)
            for e in quota
        ),
        xp7=sum(
            e["points"]
            for e in live
            if stamp(e["occurred_at"]) > now - timedelta(days=7)
        ),
        xp30=sum(
            e["points"]
            for e in live
            if stamp(e["occurred_at"]) > now - timedelta(days=30)
        ),
    )


def summary(user_id: str) -> dict | None:
    if not configured() or not control()["enabled"]:
        return None
    a = account(user_id)
    t = totals(user_id)
    return {key: a[key] for key in ("member_id", "alias", "hidden")} | dict(
        lifetime_xp=t.get("lifetime_xp", 0),
        contribution_days=t.get("days", 0),
        report_count=t.get("reports", 0),
        help_count=t.get("helped", 0),
        today_reports=t.get("today_reports", 0),
        today_help=t.get("today_help", 0),
        rank=rank_progress(t.get("lifetime_xp", 0), t.get("days", 0)),
        achievements=achievements(t.get("reports", 0), t.get("helped", 0)),
    )


def update_settings(user_id: str, values: dict) -> dict:
    account(user_id)
    values = {"alias": values["alias"].strip(), "hidden": values["hidden"]}
    if len(values["alias"]) < 3:
        raise ValueError("นามแฝงต้องมีอย่างน้อย 3 ตัวอักษร")
    if settings.local_demo_mode:
        with _LOCK:
            _ACCOUNTS[user_id].update(values)
    else:
        try:
            db.get_client().table("community_xp_accounts").update(values).eq(
                "user_id", user_id
            ).execute()
        except Exception as exc:
            raise UpstreamError("บันทึกนามแฝงไม่สำเร็จ") from exc
    return summary(user_id)


def board(period: str, offset: int, user_id: str | None = None) -> dict:
    if not enabled():
        return dict(period=period, users=[], me=None, next_offset=None)
    if settings.local_demo_mode:
        rows = []
        for uid, a in list(_ACCOUNTS.items()):
            t = totals(uid)
            points = t[{"all": "lifetime_xp", "7d": "xp7", "30d": "xp30"}[period]]
            if not a["hidden"] and points > 0:
                rows.append(
                    dict(
                        member_id=a["member_id"],
                        alias=a["alias"],
                        xp=points,
                        lifetime_xp=t["lifetime_xp"],
                        days=t["days"],
                    )
                )
        rows.sort(key=lambda r: (-r["xp"], r["member_id"]))
        previous = None
        for index, row in enumerate(rows, 1):
            if row["xp"] != previous:
                rank = index
            row["rank"] = rank
            previous = row["xp"]
        me = next(
            (
                r
                for r in rows
                if _ACCOUNTS.get(user_id, {}).get("member_id") == r["member_id"]
            ),
            None,
        )
        rows = rows[offset : offset + 51]
    else:
        response = rpc(
            "community_xp_board", dict(p_period=period, p_offset=offset, p_user=user_id)
        )
        rows = response["rows"]
        me = response.get("me")

    if user_id and me is None:
        a = account(user_id)
        t = totals(user_id)
        me = dict(
            member_id=a["member_id"],
            alias=a["alias"],
            rank=None,
            xp=t.get({"all": "lifetime_xp", "7d": "xp7", "30d": "xp30"}[period], 0),
            lifetime_xp=t.get("lifetime_xp", 0),
            days=t.get("days", 0),
        )

    def present(r):
        return {
            k: r[k] for k in ("member_id", "alias", "rank", "xp", "lifetime_xp")
        } | {"title": rank_progress(r["lifetime_xp"], r["days"])}

    return dict(
        period=period,
        users=[present(r) for r in rows[:50]],
        me=present(me) if me else None,
        next_offset=offset + 50 if len(rows) > 50 else None,
    )


def claim(user_id: str, request_id: str) -> dict:
    account(user_id)
    if not settings.local_demo_mode:
        return rpc("claim_community_help", dict(p_user=user_id, p_request=request_id))
    from ..measurement import service, store

    with _LOCK:
        row = store.get(request_id)
        if not row:
            raise KeyError()
        service.view(row, user_id)
        existing = _CLAIMS.get((request_id, user_id))
        now = datetime.now(UTC)
        deadline = stamp(row["expires_at"])
        if row["status"] == "fulfilled":
            deadline = min(deadline, stamp(row["updated_at"]) + timedelta(minutes=15))
        if (
            row["user_id"] == user_id
            or row["status"] in {"cancelled", "expired"}
            or deadline <= now
            or (
                not existing
                and (row["status"] != "active" or stamp(row["starts_at"]) > now)
            )
        ):
            raise ValueError("คำขอนี้ไม่เปิดรับผู้ช่วยใหม่")
        result = existing or dict(request_id=request_id, started_at=now.isoformat())
        _CLAIMS[(request_id, user_id)] = result
        return result | dict(deadline=deadline.isoformat(), potential_xp=5)


def process() -> dict:
    return (
        rpc("process_community_xp", {"p_limit": 50})
        if enabled() and not settings.local_demo_mode
        else {"processed": 0}
    )


def reward_report(report: dict) -> dict:
    if not configured():
        return {"status": "disabled"}
    try:
        if not control()["enabled"]:
            return {"status": "disabled"}
    except UpstreamError:
        return {"status": "pending"}
    try:
        if settings.local_demo_mode:
            _reward_demo(report)
        else:
            process()
        rows = (
            [
                e
                for e in _EVENTS
                if str(e.get("report_id")) == str(report["id"])
                and e["user_id"] == str(report["user_id"])
                and e["kind"] in {"report", "help"}
            ]
            if settings.local_demo_mode
            else db.get_client()
            .table("community_xp_events")
            .select("*")
            .eq("user_id", str(report["user_id"]))
            .eq("report_id", str(report["id"]))
            .in_("kind", ["report", "help"])
            .execute()
            .data
            or []
        )
        if not rows:
            return {"status": "pending"}
        reversed_ids = (
            {e.get("reverses") for e in _EVENTS}
            if settings.local_demo_mode
            else {
                e["reverses"]
                for e in (
                    db.get_client()
                    .table("community_xp_events")
                    .select("reverses")
                    .in_("reverses", [r["id"] for r in rows])
                    .execute()
                    .data
                    or []
                )
            }
        )
        rows = [
            r
            | (
                {"points": 0, "reason": "คะแนนรายการนี้ถูกยกเลิกหลังตรวจสอบ"}
                if r["id"] in reversed_ids
                else {}
            )
            for r in rows
        ]
        base = next(e for e in rows if e["kind"] == "report")
        help_event = next((e for e in rows if e["kind"] == "help"), None)
        return dict(
            status="granted" if sum(e["points"] for e in rows) > 0 else "not_eligible",
            report_xp=base["points"],
            help_xp=help_event["points"] if help_event else 0,
            reason=REASONS.get(base["reason"], base["reason"]),
            bonus_reason=REASONS.get(help_event["reason"], help_event["reason"])
            if help_event
            else None,
        )
    except Exception:
        logger.exception("xp_retry_pending", extra={"report_id": report["id"]})
        return {"status": "pending"}


def _reward_demo(report: dict):
    from ..measurement import store

    with _LOCK:
        uid = str(report["user_id"])
        account(uid)
        if any(e.get("report_id") == report["id"] for e in _EVENTS):
            return
        occurred = report.get("moderated_at") or datetime.now(UTC).isoformat()
        t = stamp(occurred)
        own = [e for e in _EVENTS if e["user_id"] == uid and e["points"] > 0]
        today = [e for e in own if thai_day(e["occurred_at"]) == thai_day(t)]
        reason = base_eligibility(report)
        if reason == "granted" and any(
            t - timedelta(minutes=30) < stamp(e["occurred_at"]) <= t for e in own
        ):
            reason = "cooldown"
        if reason == "granted" and sum(e["kind"] == "report" for e in today) >= 5:
            reason = "report_limit"
        evidence = db.get_report_evidence(report["id"]) or {}
        metadata = evidence.get("image_metadata") or {}
        req_id = metadata.get("measurement_request_id")
        req = store.get(req_id) if req_id else None
        bonus_reason = None
        if req:
            bonus_reason = help_eligibility(
                report, req, _CLAIMS.get((req_id, uid)), metadata
            )
            if reason in {"not_approved", "stale", "duplicate", "cooldown"}:
                bonus_reason = reason
            if bonus_reason == "granted":
                pair = [
                    e
                    for e in own
                    if e.get("requester_id") == req["user_id"] and e["kind"] == "help"
                ]
                if any(e.get("request_id") == req_id for e in own):
                    bonus_reason = "already_rewarded"
                elif sum(e["kind"] == "help" for e in today) >= 3:
                    bonus_reason = "help_limit"
                elif (
                    any(thai_day(e["occurred_at"]) == thai_day(t) for e in pair)
                    or sum(
                        stamp(e["occurred_at"]) > t - timedelta(days=7) for e in pair
                    )
                    >= 3
                ):
                    bonus_reason = "pair_limit"
        for kind, points, why in [
            ("report", 10 if reason == "granted" else 0, reason)
        ] + (
            [("help", 5 if bonus_reason == "granted" else 0, bonus_reason)]
            if bonus_reason
            else []
        ):
            _EVENTS.append(
                dict(
                    id=str(uuid4()),
                    user_id=uid,
                    report_id=report["id"],
                    kind=kind,
                    points=points,
                    reason=why,
                    occurred_at=occurred,
                    recorded_at=datetime.now(UTC).isoformat(),
                    policy_version=POLICY_VERSION,
                    request_id=req_id if kind == "help" else None,
                    requester_id=req["user_id"] if kind == "help" else None,
                )
            )


def result_for_report(report_id: str, user_id: str) -> dict:
    try:
        row = db.get_community_report(report_id)
        if row and str(row["user_id"]) == user_id:
            return reward_report(row)
    except Exception:
        logger.exception("xp_result_pending", extra={"report_id": report_id})
    return {"status": "pending" if configured() else "disabled"}


def public_identity(user_id: str) -> dict:
    """Optional decoration; outages never fall back to Google identity."""
    if not enabled():
        return {}
    try:
        a = account(user_id)
        t = totals(user_id)
        return dict(
            member_id=None if a["hidden"] else a["member_id"],
            alias=a["alias"],
            rank=rank_progress(t.get("lifetime_xp", 0), t.get("days", 0)),
        )
    except Exception:
        logger.warning("xp_public_identity_unavailable")
        return {}


def public_member(member_id: str) -> dict:
    if not enabled():
        raise KeyError()
    if settings.local_demo_mode:
        a = next(
            (
                a
                for a in _ACCOUNTS.values()
                if a["member_id"] == member_id and not a["hidden"]
            ),
            None,
        )
    else:
        try:
            rows = (
                db.get_client()
                .table("community_xp_accounts")
                .select("user_id")
                .eq("member_id", member_id)
                .eq("hidden", False)
                .limit(1)
                .execute()
                .data
            )
            a = rows[0] if rows else None
        except Exception as exc:
            raise UpstreamError("โหลดสมาชิกไม่สำเร็จ") from exc
    if not a:
        raise KeyError()
    s = summary(a["user_id"])
    return {
        key: s[key]
        for key in (
            "member_id",
            "alias",
            "lifetime_xp",
            "contribution_days",
            "rank",
            "achievements",
        )
    }


def existing_claim(user_id: str, request: dict) -> dict | None:
    if not enabled():
        return None
    if settings.local_demo_mode:
        row = _CLAIMS.get((request["id"], user_id))
    else:
        try:
            rows = (
                db.get_client()
                .table("community_help_claims")
                .select("started_at")
                .eq("request_id", request["id"])
                .eq("user_id", user_id)
                .limit(1)
                .execute()
                .data
            )
            row = rows[0] if rows else None
        except Exception as exc:
            raise UpstreamError("โหลดภารกิจช่วยวัดไม่สำเร็จ") from exc
    if not row or request["status"] in {"cancelled", "expired"}:
        return None
    deadline = stamp(request["expires_at"])
    if request["status"] == "fulfilled":
        deadline = min(deadline, stamp(request["updated_at"]) + timedelta(minutes=15))
    if deadline <= datetime.now(UTC):
        return None
    return dict(
        request_id=request["id"],
        started_at=row["started_at"],
        deadline=deadline.isoformat(),
        potential_xp=5,
    )


_CONTROL_CACHE: tuple[str, float, dict] | None = None


def control() -> dict:
    global _CONTROL_CACHE
    if settings.local_demo_mode:
        return dict(enabled=True, maintenance=False, reset_version="local-xp-v1")
    if not settings.community_xp_enabled:
        return dict(enabled=False, maintenance=False, reset_version="legacy")
    key = settings.supabase_url
    if (
        _CONTROL_CACHE
        and _CONTROL_CACHE[0] == key
        and monotonic() - _CONTROL_CACHE[1] < 2
    ):
        return dict(_CONTROL_CACHE[2])
    try:
        rows = (
            db.get_client()
            .table("community_xp_control")
            .select("enabled,maintenance,reset_version")
            .limit(1)
            .execute()
            .data
        )
        _CONTROL_CACHE = (key, monotonic(), rows[0])
        return dict(rows[0])
    except Exception as exc:
        raise UpstreamError("ตรวจสถานะระบบชุมชนไม่สำเร็จ") from exc


def public_identities(rows: list[dict]) -> dict[str, dict]:
    """Resolve map authors in two batched reads rather than per report."""
    ids = list(
        {
            str(r["user_id"])
            for r in rows
            if r.get("show_reporter_profile")
            and r.get("source_type", "individual") == "individual"
        }
    )
    if not enabled() or not ids:
        return {}
    if settings.local_demo_mode:
        return {uid: public_identity(uid) for uid in ids}
    try:
        client = db.get_client()
        accounts = (
            client.table("community_xp_accounts")
            .select("user_id,member_id,alias,hidden")
            .in_("user_id", ids)
            .execute()
            .data
            or []
        )
        total_rows = (
            client.rpc("community_xp_totals").in_("user_id", ids).execute().data or []
        )
        by_id = {r["user_id"]: r for r in total_rows}
        return {
            str(a["user_id"]): dict(
                member_id=None if a["hidden"] else a["member_id"],
                alias=a["alias"],
                rank=rank_progress(
                    by_id.get(a["user_id"], {}).get("lifetime_xp", 0),
                    by_id.get(a["user_id"], {}).get("days", 0),
                ),
            )
            for a in accounts
        }
    except Exception:
        logger.warning("xp_public_identity_unavailable")
        return {}


def admin_overview() -> dict:
    if not enabled():
        return dict(
            pending_jobs=0, accounts=0, zero_reasons={}, repeated_pairs=0, events=[]
        )
    if settings.local_demo_mode:
        rows = list(reversed(_EVENTS[-50:]))
        overview = dict(
            pending_jobs=0, accounts=len(_ACCOUNTS), zero_reasons={}, repeated_pairs=0
        )
        reversed_ids = {r.get("reverses") for r in _EVENTS}
    else:
        overview = rpc("community_xp_admin_overview", {})
        try:
            rows = (
                db.get_client()
                .table("community_xp_events")
                .select("*")
                .order("recorded_at", desc=True)
                .limit(50)
                .execute()
                .data
                or []
            )
            ids = [r["id"] for r in rows]
            rev = (
                db.get_client()
                .table("community_xp_events")
                .select("reverses")
                .in_("reverses", ids)
                .execute()
                .data
                if ids
                else []
            )
            reversed_ids = {r["reverses"] for r in rev}
        except Exception as exc:
            raise UpstreamError("โหลดประวัติคะแนนไม่สำเร็จ") from exc
    return overview | {
        "events": [
            r
            | {
                "reversed": r["id"] in reversed_ids,
                "reason": REASONS.get(r["reason"], r["reason"]),
            }
            for r in rows
        ]
    }


def reverse_event(event_id: str, reason: str, admin_id: str):
    if not settings.local_demo_mode:
        rpc(
            "reverse_community_xp",
            dict(p_event=event_id, p_reason=f"{admin_id}: {reason}"),
        )
        return
    with _LOCK:
        event = next(
            (e for e in _EVENTS if e["id"] == event_id and e["points"] > 0), None
        )
        if not event:
            raise KeyError()
        if any(e.get("reverses") == event_id for e in _EVENTS):
            return
        _EVENTS.append(
            event
            | dict(
                id=str(uuid4()),
                kind="reversal",
                points=-event["points"],
                reason=f"{admin_id}: {reason}",
                reverses=event_id,
                recorded_at=datetime.now(UTC).isoformat(),
                report_id=None,
                request_id=None,
                requester_id=None,
            )
        )
