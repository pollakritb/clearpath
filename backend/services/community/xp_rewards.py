"""XP claims, rewards, settlement and reversals; never decides publication."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from backend.services import store_client

from ...algorithms.community_xp import (
    POLICY_VERSION,
    REASONS,
    base_eligibility,
    help_eligibility,
    rank_progress,
    stamp,
    thai_day,
)
from ...core.config import settings
from ...core.errors import UpstreamError
from .. import supabase_client as db
from ..record_keys import creation_key
from . import xp_accounts, xp_runtime

logger = logging.getLogger("clearpath.xp")


def claim(user_id: str, request_id: str) -> dict:
    xp_accounts.account(user_id)
    if not settings.local_demo_mode:
        return xp_runtime.rpc(
            "claim_community_help", dict(p_user=user_id, p_request=request_id)
        )
    from ..measurement import service, store

    with xp_runtime._LOCK:
        row = store.get(request_id)
        if not row:
            raise KeyError()
        service.view(row, user_id)
        invitation = store.recipient(request_id, user_id)
        if invitation and invitation.get("declined"):
            raise ValueError("คุณเลือกไม่สะดวกช่วยวัดคำขอนี้แล้ว")
        existing = xp_runtime._CLAIMS.get((request_id, user_id))
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
        xp_runtime._CLAIMS[(request_id, user_id)] = result
        return result | dict(deadline=deadline.isoformat(), potential_xp=5)


def process() -> dict:
    from . import policy_v2

    if not xp_runtime.enabled():
        return {"processed": 0}
    result = (
        xp_runtime.rpc("process_community_xp", {"p_limit": 50})
        if not settings.local_demo_mode
        else {"processed": 0}
    )
    from . import policy_v3

    if policy_v2.active() or policy_v3.applies():
        from . import missions, seasons

        def compensate():
            if not settings.local_demo_mode:
                xp_runtime.rpc("reconcile_community_v2", {})
                if policy_v3.applies():
                    xp_runtime.rpc("reconcile_contribution_v3", {})
            else:
                from .compensation import reconcile_demo, reconcile_demo_v3

                reconcile_demo()
                if policy_v3.applies():
                    reconcile_demo_v3()

        for task, name in [
            (compensate, "compensation"),
            (missions.refresh, "coverage_missions"),
            (seasons.freeze_due, "season_freeze"),
        ]:
            try:
                task()
            except Exception:
                logger.exception("community_v2_maintenance_retry", extra={"task": name})
    return result


def reward_report(report: dict) -> dict:
    if not xp_runtime.configured():
        return {"status": "disabled"}
    try:
        if not xp_runtime.control()["enabled"]:
            return {"status": "disabled"}
    except UpstreamError:
        return {"status": "pending"}
    try:
        from ..measurement import registered

        automatic = registered.enabled()
        if automatic:
            registered.process_matches()
        if settings.local_demo_mode:
            _reward_demo(report)
            from . import policy_v2, policy_v3

            if policy_v2.active():
                from .compensation import reconcile_demo

                reconcile_demo()
            if policy_v3.applies():
                from .compensation import reconcile_demo_v3

                reconcile_demo_v3()
        else:
            process()
        rows = (
            [
                e
                for e in xp_runtime._EVENTS
                if str(e.get("report_id")) == str(report["id"])
                and e["user_id"] == str(report["user_id"])
                and e["kind"] in {"report", "help", "first_day", "contribution_week"}
            ]
            if settings.local_demo_mode
            else store_client.get_client()
            .table("community_xp_events")
            .select("*")
            .eq("user_id", str(report["user_id"]))
            .eq("report_id", str(report["id"]))
            .in_("kind", ["report", "help", "first_day", "contribution_week"])
            .execute()
            .data
            or []
        )
        if not rows:
            if report.get("status") == "rejected":
                return {"status": "not_eligible", "reason": REASONS["not_approved"]}
            return {"status": "pending"}
        reversed_ids = (
            {e.get("reverses") for e in xp_runtime._EVENTS}
            if settings.local_demo_mode
            else {
                e["reverses"]
                for e in (
                    store_client.get_client()
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
            first_day_xp=sum(e["points"] for e in rows if e["kind"] == "first_day"),
            week_xp=sum(e["points"] for e in rows if e["kind"] == "contribution_week"),
            policy_version=base["policy_version"],
            report_xp=base["points"],
            help_xp=help_event["points"] if help_event else 0,
            reason=REASONS.get(base["reason"], base["reason"]),
            matched_request_count=registered.match_count(str(report["id"]))
            if automatic
            else 0,
            bonus_reason=REASONS.get(help_event["reason"], help_event["reason"])
            if help_event
            else None,
        )
    except Exception:
        logger.exception("xp_retry_pending", extra={"report_id": report["id"]})
        return {"status": "pending"}


def _reward_demo(report: dict):
    from ..measurement import store

    with xp_runtime._LOCK:
        uid = str(report["user_id"])
        xp_accounts.account(uid)
        if any(e.get("report_id") == report["id"] for e in xp_runtime._EVENTS):
            return
        from . import policy_v2, policy_v3

        policy = policy_v2.release()
        v3 = policy_v3.applies(report)
        v2 = v3 or (
            policy["active_version"] == "v2"
            and stamp(report["created_at"]) >= stamp(policy["launched_at"])
        )
        if v3:
            policy = policy | {"launched_at": policy_v3.release()["starts_at"]}
            if policy_v3.release().get("paused"):
                return
        occurred = (
            report["created_at"]
            if v2
            else report.get("moderated_at") or datetime.now(UTC).isoformat()
        )
        t = stamp(occurred)
        own = [e for e in xp_runtime._EVENTS if e["user_id"] == uid and e["points"] > 0]
        today = [e for e in own if thai_day(e["occurred_at"]) == thai_day(t)]
        reason = base_eligibility(report)
        if reason == "granted" and any(
            t - timedelta(minutes=30) < stamp(e["occurred_at"]) <= t
            for e in own
            if not v2 or e["kind"] in {"report", "help"}
        ):
            reason = "cooldown"
        if reason == "granted" and sum(e["kind"] == "report" for e in today) >= 5:
            reason = "report_limit"
        evidence = db.get_report_evidence(report["id"]) or {}
        metadata = evidence.get("image_metadata") or {}
        from ..measurement import registered

        automatic = registered.enabled()
        req_id = metadata.get("measurement_request_id")
        if automatic:
            candidates = [
                store.get(rid) for rid in registered.MATCHES.get(report["id"], [])
            ]
            fallback_candidates = [r for r in candidates if r and r["user_id"] != uid]
            candidates = [
                r
                for r in candidates
                if r
                and r["user_id"] != uid
                and not any(e.get("request_id") == r["id"] for e in own)
                and not any(
                    e["kind"] == "help"
                    and e.get("requester_id") == r["user_id"]
                    and thai_day(e["occurred_at"]) == thai_day(t)
                    for e in own
                )
                and sum(
                    e["kind"] == "help"
                    and e.get("requester_id") == r["user_id"]
                    and stamp(e["occurred_at"]) > t - timedelta(days=7)
                    for e in own
                )
                < 3
            ]
            if v3 and not candidates:
                candidates = fallback_candidates
            candidates.sort(key=lambda r: (r["created_at"], r["id"]))
            req_id = candidates[0]["id"] if candidates else None
        req = store.get(req_id) if req_id else None
        bonus_reason = None
        if req:
            from ...algorithms.contribution_v3 import service_eligibility

            check_service = service_eligibility if v3 else help_eligibility
            bonus_reason = check_service(
                report,
                req,
                xp_runtime._CLAIMS.get((req_id, uid)),
                metadata,
                automatic=automatic,
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
        mission = None
        if v2:
            from ...algorithms.contribution_v2 import (
                contribution_awards as legacy_awards,
            )
            from ...algorithms.contribution_v3 import contribution_awards as v3_awards
            from . import missions

            contribution_awards = v3_awards if v3 else legacy_awards
            if reason in {"granted", "report_limit"}:
                mission = missions.demo_match(report, metadata)
            awards = contribution_awards(
                report,
                xp_runtime._EVENTS,
                service_eligible=bonus_reason == "granted" or mission is not None,
                launched_at=policy["launched_at"],
            )
            if v3 and (req or mission) and not any(a["kind"] == "help" for a in awards):
                awards.append(
                    {
                        "kind": "help",
                        "points": 0,
                        "reason": "help_limit"
                        if mission
                        else bonus_reason or "no_claim",
                    }
                )
            if mission:
                mission.update(
                    state="fulfilled",
                    fulfilled_report_id=report["id"],
                    fulfilled_user_id=uid,
                    fulfilled_at=report["captured_at"],
                )
                from ...algorithms.distance import haversine_km

                for overlap in policy_v2.DEMO_MISSIONS.values():
                    if (
                        overlap["state"] == "open"
                        and stamp(overlap["starts_at"])
                        <= stamp(report["captured_at"]) + timedelta(hours=1)
                        and stamp(overlap["expires_at"]) > stamp(report["captured_at"])
                        and haversine_km(
                            overlap["lat"], overlap["lon"], report["lat"], report["lon"]
                        )
                        <= overlap["radius_km"]
                    ):
                        overlap["state"] = "expired"
                        overlap["inputs"] = {
                            **overlap.get("inputs", {}),
                            "covered_by_report": report["id"],
                        }
                if bonus_reason != "granted":
                    req_id = None
                    bonus_reason = (
                        "coverage_mission"
                        if any(a["kind"] == "help" and a["points"] > 0 for a in awards)
                        else "help_limit"
                    )
            before_rank = rank_progress(xp_accounts.totals(uid)["lifetime_xp"])["code"]
            for award in awards:
                why = (
                    bonus_reason
                    if award["kind"] == "help" and mission and award["points"] > 0
                    else award["reason"]
                )
                xp_runtime._EVENTS.append(
                    dict(
                        id=creation_key("community_xp_events"),
                        user_id=uid,
                        report_id=report["id"],
                        kind=award["kind"],
                        points=award["points"],
                        reason=why,
                        occurred_at=occurred,
                        recorded_at=datetime.now(UTC).isoformat(),
                        policy_version="contribution-v3" if v3 else "contribution-v2",
                        request_id=req_id if award["kind"] == "help" else None,
                        requester_id=req["user_id"]
                        if req and award["kind"] == "help" and req_id
                        else None,
                        mission_id=mission["id"]
                        if mission and award["kind"] == "help" and not req_id
                        else None,
                    )
                )
            after = rank_progress(xp_accounts.totals(uid)["lifetime_xp"])
            if after["code"] != before_rank:
                from .. import notifications

                notifications.enqueue_user_notification(
                    user_id=uid,
                    event_type="rank_up",
                    title="คุณเลื่อนยศแล้ว",
                    body=after["label"],
                    url="/profile",
                    deduplication_key=f"rank:{uid}:{after['code']}",
                )
            return
        for kind, points, why in [
            ("report", 10 if reason == "granted" else 0, reason)
        ] + (
            [("help", 5 if bonus_reason == "granted" else 0, bonus_reason)]
            if bonus_reason
            else []
        ):
            xp_runtime._EVENTS.append(
                dict(
                    id=creation_key("community_xp_events"),
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
    return {"status": "pending" if xp_runtime.configured() else "disabled"}


def existing_claim(user_id: str, request: dict) -> dict | None:
    if not xp_runtime.enabled():
        return None
    if settings.local_demo_mode:
        row = xp_runtime._CLAIMS.get((request["id"], user_id))
    else:
        try:
            rows = (
                store_client.get_client()
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
    return present_claim(request, row)


def existing_claims(user_id: str, request_ids: list[str]) -> dict[str, dict]:
    """Local-demo batch snapshot; production claims are loaded by measurement store."""
    with xp_runtime._LOCK:
        return {
            rid: dict(row)
            for (rid, uid), row in xp_runtime._CLAIMS.items()
            if uid == user_id and rid in request_ids
        }


def present_claim(request: dict, row: dict | None) -> dict | None:
    """Present a loaded claim without performing storage or control lookups."""
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


def reverse_event(event_id: str, reason: str, admin_id: str):
    if not settings.local_demo_mode:
        xp_runtime.rpc(
            "reverse_community_xp",
            dict(p_event=event_id, p_reason=f"{admin_id}: {reason}"),
        )
        return
    with xp_runtime._LOCK:
        event = next(
            (e for e in xp_runtime._EVENTS if e["id"] == event_id and e["points"] > 0),
            None,
        )
        if not event:
            raise KeyError()
        if any(e.get("reverses") == event_id for e in xp_runtime._EVENTS):
            return
        xp_runtime._EVENTS.append(
            event
            | dict(
                id=creation_key("community_xp_events"),
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
