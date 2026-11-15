"""XP account, identity and leaderboard reads; independent of reward processing."""

from __future__ import annotations

import logging
from contextlib import suppress
from datetime import UTC, datetime, timedelta

from backend.services import store_client

from ...algorithms.community_xp import (
    REASONS,
    achievements,
    rank_progress,
    stamp,
    thai_day,
)
from ...core.config import settings
from ...core.errors import ConfigurationError, UpstreamError
from .. import supabase_client as db
from ..record_keys import creation_key
from . import xp_runtime

logger = logging.getLogger("clearpath.xp")


def account(user_id: str) -> dict:
    if not xp_runtime.enabled():
        raise ConfigurationError("ระบบคะแนนยังไม่เปิดใช้งาน")
    if settings.local_demo_mode:
        with xp_runtime._LOCK:
            if user_id not in xp_runtime._ACCOUNTS:
                member_id = creation_key("community_members")
                xp_runtime._ACCOUNTS[user_id] = dict(
                    user_id=user_id,
                    member_id=member_id,
                    alias=f"สมาชิก CP-{member_id[4:] if member_id.startswith('MBR-') else member_id[:8].upper()}",
                    hidden=False,
                    identity_mode="google",
                )
            return dict(xp_runtime._ACCOUNTS[user_id])
    try:
        client = store_client.get_client()
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
            [e for e in xp_runtime._EVENTS if e["user_id"] == user_id],
            key=lambda e: e["recorded_at"],
            reverse=True,
        )[offset : offset + limit]
    try:
        return (
            store_client.get_client()
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
                store_client.get_client()
                .rpc("community_xp_totals", {"p_user": user_id})
                .execute()
                .data
            )
            return rows[0] if rows else {}
        except Exception as exc:
            raise UpstreamError("โหลดคะแนนไม่สำเร็จ") from exc
    live = [
        e
        for e in xp_runtime._EVENTS
        if e["user_id"] == user_id
        and e["points"] > 0
        and not any(r.get("reverses") == e["id"] for r in xp_runtime._EVENTS)
    ]
    quota = [
        e for e in xp_runtime._EVENTS if e["user_id"] == user_id and e["points"] > 0
    ]
    now = datetime.now(UTC)
    return dict(
        lifetime_xp=sum(e["points"] for e in live),
        days=len({thai_day(e["occurred_at"]) for e in live if e["kind"] == "report"}),
        reports=sum(e["kind"] == "report" for e in live),
        helped=sum(e["kind"] == "help" and not e.get("mission_id") for e in live),
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


def summary(user_id: str, *, include_details: bool = True) -> dict | None:
    if not xp_runtime.configured() or not xp_runtime.control()["enabled"]:
        return None
    a = account(user_id)
    t = totals(user_id)
    from . import community_trust, policy_v2, policy_v3

    v3 = policy_v3.release()
    current_v3 = policy_v3.applies(policy=v3)
    policy = policy_v2.release()
    extra = (
        {
            "policy_version": "contribution-v2"
            if policy["active_version"] == "v2"
            else "xp-v1",
            "launched_at": policy["launched_at"],
            **policy_v2.counters(user_id),
            "evidence_history": policy_v2.outcomes(user_id)
            if include_details
            else None,
        }
        if policy.get("launched_at") is not None
        else {}
    )
    if current_v3:
        extra.update(
            policy_version="contribution-v3",
            launched_at=v3["starts_at"],
            **(
                {}
                if policy.get("launched_at") is not None
                else policy_v2.counters(user_id)
            ),
        )
    extra.update(
        scheduled_policy_version="contribution-v3"
        if v3.get("starts_at") and not current_v3
        else None,
        scheduled_starts_at=v3.get("starts_at") if not current_v3 else None,
        xp_paused=bool(v3.get("paused")) if current_v3 else False,
    )
    return (
        extra
        | {
            "community_trust": community_trust.summary(user_id, owner=True)
            if include_details
            else None,
        }
        | {key: a[key] for key in ("member_id", "alias", "hidden")}
        | dict(
            identity_mode=a.get("identity_mode", "google"),
            lifetime_xp=t.get("lifetime_xp", 0),
            contribution_days=t.get("days", 0),
            report_count=t.get("reports", 0),
            help_count=t.get("helped", 0),
            today_reports=t.get("today_reports", 0),
            today_help=t.get("today_help", 0),
            rank=rank_progress(t.get("lifetime_xp", 0), t.get("days", 0)),
            achievements=achievements(t.get("reports", 0), t.get("helped", 0)),
        )
    )


def update_settings(
    user_id: str, values: dict, *, include_details: bool = True
) -> dict:
    previous = account(user_id)
    values = {
        "alias": values["alias"].strip(),
        "hidden": values["hidden"],
        "identity_mode": values.get("identity_mode")
        or previous.get("identity_mode", "google"),
    }
    if len(values["alias"]) < 3:
        raise ValueError("นามแฝงต้องมีอย่างน้อย 3 ตัวอักษร")
    if settings.local_demo_mode:
        with xp_runtime._LOCK:
            xp_runtime._ACCOUNTS[user_id].update(values)
    else:
        try:
            store_client.get_client().table("community_xp_accounts").update(values).eq(
                "user_id", user_id
            ).execute()
        except Exception as exc:
            raise UpstreamError("บันทึกนามแฝงไม่สำเร็จ") from exc
    return summary(user_id, include_details=include_details)


def _legacy_board(period: str, offset: int, user_id: str | None = None) -> dict:
    if not xp_runtime.enabled():
        return dict(period=period, users=[], me=None, next_offset=None)
    if settings.local_demo_mode:
        rows = []
        for uid, a in list(xp_runtime._ACCOUNTS.items()):
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
                if xp_runtime._ACCOUNTS.get(user_id, {}).get("member_id")
                == r["member_id"]
            ),
            None,
        )
        rows = rows[offset : offset + 51]
    else:
        response = xp_runtime.rpc(
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

    identities = leaderboard_names(
        [r["member_id"] for r in rows] + ([me["member_id"]] if me else [])
    )

    def present(r):
        return {
            k: r[k] for k in ("member_id", "alias", "rank", "xp", "lifetime_xp")
        } | {
            "alias": identities.get(r["member_id"], r["alias"]),
            "title": rank_progress(r["lifetime_xp"], r["days"]),
        }

    return dict(
        period=period,
        users=[present(r) for r in rows[:50]],
        me=present(me) if me else None,
        next_offset=offset + 50 if len(rows) > 50 else None,
    )


def board(period: str | None, offset: int, user_id: str | None = None) -> dict:
    if period is None:
        from . import policy_v2, policy_v3

        period = "month" if policy_v2.active() or policy_v3.applies() else "all"
    if period in {"all", "7d", "30d"}:
        return _legacy_board(period, offset, user_id)
    from . import seasons

    return seasons.board(period, offset, user_id)


def leaderboard_names(member_ids: list[str]) -> dict[str, str]:
    """Only the chosen public name; never return Auth IDs or emails."""
    try:
        return _leaderboard_names(member_ids)
    except Exception as exc:
        raise UpstreamError("โหลดชื่อที่แสดงในอันดับไม่สำเร็จ") from exc


def _leaderboard_names(member_ids: list[str]) -> dict[str, str]:
    if not member_ids:
        return {}
    if settings.local_demo_mode:
        accounts = [
            a for a in xp_runtime._ACCOUNTS.values() if a["member_id"] in member_ids
        ]
        profiles = {}
        for a in accounts:
            if a.get("identity_mode", "google") == "google":
                with suppress(KeyError):
                    profiles[a["user_id"]] = db.get_existing_profile(a["user_id"])
    else:
        client = store_client.get_client()
        accounts = (
            client.table("community_xp_accounts")
            .select("user_id,member_id,alias,identity_mode")
            .in_("member_id", list(set(member_ids)))
            .execute()
            .data
            or []
        )
        ids = [a["user_id"] for a in accounts if a["identity_mode"] == "google"]
        profiles = (
            {
                p["id"]: p
                for p in (
                    client.table("profiles")
                    .select("id,display_name")
                    .in_("id", ids)
                    .execute()
                    .data
                    or []
                )
            }
            if ids
            else {}
        )
    return {
        a["member_id"]: (
            profiles.get(a["user_id"], {}).get("display_name")
            if a.get("identity_mode", "google") == "google"
            else None
        )
        or a["alias"]
        for a in accounts
    }


def public_identity(user_id: str) -> dict:
    """Optional decoration; outages never fall back to Google identity."""
    if not xp_runtime.enabled():
        return {}
    try:
        a = account(user_id)
        t = totals(user_id)
        return dict(
            member_id=(
                a["member_id"]
                if not a["hidden"] and a.get("identity_mode", "alias") == "google"
                else None
            ),
            alias=a["alias"],
            rank=rank_progress(t.get("lifetime_xp", 0), t.get("days", 0)),
        )
    except Exception:
        logger.warning("xp_public_identity_unavailable")
        return {}


def public_member(member_id: str) -> dict:
    from . import community_trust

    if not xp_runtime.enabled():
        raise KeyError()
    if settings.local_demo_mode:
        a = next(
            (
                a
                for a in xp_runtime._ACCOUNTS.values()
                if a["member_id"] == member_id and not a["hidden"]
            ),
            None,
        )
    else:
        try:
            rows = (
                store_client.get_client()
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
    s["alias"] = leaderboard_names([member_id]).get(member_id, s["alias"])
    return {
        "evidence_history": s.get("evidence_history"),
        "community_trust": s.get("community_trust")
        if s.get("identity_mode") == "google"
        and not s.get("hidden")
        and community_trust.public_enabled()
        else None,
    } | {
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
    if not xp_runtime.enabled() or not ids:
        return {}
    if settings.local_demo_mode:
        return {uid: public_identity(uid) for uid in ids}
    try:
        client = store_client.get_client()
        accounts = (
            client.table("community_xp_accounts")
            .select("user_id,member_id,alias,hidden,identity_mode")
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
                member_id=(
                    a["member_id"]
                    if not a["hidden"] and a.get("identity_mode", "alias") == "google"
                    else None
                ),
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
    if not xp_runtime.enabled():
        return dict(
            pending_jobs=0, accounts=0, zero_reasons={}, repeated_pairs=0, events=[]
        )
    if settings.local_demo_mode:
        rows = list(reversed(xp_runtime._EVENTS[-50:]))
        overview = dict(
            pending_jobs=0,
            accounts=len(xp_runtime._ACCOUNTS),
            zero_reasons={},
            repeated_pairs=0,
        )
        reversed_ids = {r.get("reverses") for r in xp_runtime._EVENTS}
    else:
        overview = xp_runtime.rpc("community_xp_admin_overview", {})
        try:
            rows = (
                store_client.get_client()
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
                store_client.get_client()
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
