"""Versioned participation rules; no database, clock or network access."""

from datetime import datetime, timedelta
from math import isfinite

from .community_xp import base_eligibility, stamp, thai_day

VERSION = "contribution-v3"
DAILY_XP_LIMIT = 70
WEEK_BONUS_DAY_LIMIT = 90


def month_window(month: str, now: datetime) -> tuple[datetime, datetime]:
    from zoneinfo import ZoneInfo

    zone = ZoneInfo("Asia/Bangkok")
    current = now.astimezone(zone)
    if month == "month":
        year, number = current.year, current.month
    else:
        year, number = map(int, month.split("-"))
    start = datetime(year, number, 1, tzinfo=zone)
    end = datetime(
        year + (number == 12), 1 if number == 12 else number + 1, 1, tzinfo=zone
    )
    return start, end


def contribution_awards(
    report: dict, events: list[dict], *, service_eligible: bool, launched_at: str
) -> list[dict]:
    """Pure demo/rehearsal equivalent of transactional SQL; quota includes reversed awards."""
    t = stamp(report["created_at"])
    if t < stamp(launched_at):
        return []
    own = [e for e in events if str(e["user_id"]) == str(report["user_id"])]
    if any(
        str(e.get("report_id")) == str(report["id"]) and e["kind"] in {"report", "help"}
        for e in own
    ):
        return []
    reversed_ids = {e.get("reverses") for e in events}
    day = thai_day(t)
    daily = [e for e in own if thai_day(e["occurred_at"]) == day and e["points"] > 0]
    reason = base_eligibility(report)
    if (
        not isinstance(report.get("pm25"), (int, float))
        or not isfinite(report["pm25"])
        or isinstance(report.get("pm25"), bool)
        or report["pm25"] < 0
    ):
        reason = "not_approved"
    previous = [
        stamp(e["occurred_at"])
        for e in own
        if e["kind"] in {"report", "help"}
        and e["points"] > 0
        and stamp(e["occurred_at"]) <= t
    ]
    if reason == "granted" and previous and t - max(previous) < timedelta(minutes=30):
        reason = "cooldown"
    base = (
        10
        if reason == "granted" and sum(e["kind"] == "report" for e in daily) < 5
        else 0
    )
    result = [
        dict(
            kind="report",
            points=base,
            reason="report_limit" if reason == "granted" and not base else reason,
        )
    ]
    if (
        reason == "granted"
        and service_eligible
        and sum(e["kind"] == "help" for e in daily) < 3
    ):
        result.append(dict(kind="help", points=5, reason="granted"))
    if base and not any(e["kind"] == "first_day" for e in daily):
        result.append(dict(kind="first_day", points=5, reason="first_day"))
    from zoneinfo import ZoneInfo

    local = t.astimezone(ZoneInfo("Asia/Bangkok"))
    monday = (local - timedelta(days=local.weekday())).date()
    reversed_ids = {e.get("reverses") for e in events}
    week_days = {
        thai_day(e["occurred_at"])
        for e in own
        if e["kind"] == "report"
        and e["points"] > 0
        and e.get("id") not in reversed_ids
        and monday.isoformat() <= thai_day(e["occurred_at"]) <= day
    }
    if base:
        week_days.add(day)
    if (
        base
        and len(week_days) >= 5
        and not any(
            e["kind"] == "contribution_week"
            and monday.isoformat() <= thai_day(e["occurred_at"]) <= day
            for e in own
        )
    ):
        result.append(dict(kind="contribution_week", points=20, reason="five_days"))
    return result


def service_eligibility(
    report: dict,
    request: dict,
    claim: dict | None,
    metadata: dict,
    *,
    automatic: bool = False,
) -> str:
    """Service evidence is separate from report publication and base awards."""
    from .community_xp import help_eligibility

    try:
        gps = metadata.get("bonus_gps_at_submission") or {}
        lat, lon, accuracy = (float(gps[k]) for k in ("lat", "lon", "accuracy_m"))
        if (
            not all(isfinite(v) for v in (lat, lon, accuracy))
            or not (-90 <= lat <= 90 and -180 <= lon <= 180 and 0 <= accuracy <= 200)
            or report.get("clock_warning")
            or report.get("capture_source") not in {"camera", "upload", "gallery"}
        ):
            return "invalid_evidence"
        if stamp(report["captured_at"]) > stamp(request["expires_at"]):
            return "request_closed"
        result = help_eligibility(report, request, claim, metadata, automatic=automatic)
        if result != "granted":
            return result
        from .distance import haversine_km

        if (
            haversine_km(report["lat"], report["lon"], request["lat"], request["lon"])
            > 2
        ):
            return "invalid_evidence"
        return "granted"
    except (ValueError, TypeError, KeyError, OverflowError):
        return "invalid_evidence"


def dependent_bonus_actions(events: list[dict]) -> list[dict]:
    """Reconcile live day/week bonuses from the ledger; consumed quota stays intact."""
    from zoneinfo import ZoneInfo

    reversed_ids = {e.get("reverses") for e in events}
    live = [e for e in events if e["points"] > 0 and e["id"] not in reversed_ids]
    actions = []

    def bounds(event, kind):
        local = stamp(event["occurred_at"]).astimezone(ZoneInfo("Asia/Bangkok"))
        first = (
            local.date()
            if kind == "first_day"
            else (local - timedelta(days=local.weekday())).date()
        )
        return first.isoformat(), (
            first + timedelta(days=1 if kind == "first_day" else 7)
        ).isoformat()

    def bases(uid, first, end):
        return sorted(
            [
                e
                for e in live
                if e["user_id"] == uid
                and e["kind"] == "report"
                and first <= thai_day(e["occurred_at"]) < end
            ],
            key=lambda e: (stamp(e["occurred_at"]), str(e["id"])),
        )

    for e in list(live):
        if e.get("policy_version") != VERSION or e["kind"] not in {
            "first_day",
            "contribution_week",
        }:
            continue
        first, end = bounds(e, e["kind"])
        if len(
            {thai_day(b["occurred_at"]) for b in bases(e["user_id"], first, end)}
        ) < (1 if e["kind"] == "first_day" else 5):
            actions.append({"action": "reverse", "event_id": e["id"]})
            live.remove(e)
    groups = {
        (e["user_id"], kind, *bounds(e, kind))
        for e in live
        if e["kind"] == "report" and e.get("policy_version") == VERSION
        for kind in ("first_day", "contribution_week")
    }
    for uid, kind, first, end in sorted(groups):
        if any(
            e["user_id"] == uid
            and e["kind"] == kind
            and first <= thai_day(e["occurred_at"]) < end
            for e in live
        ):
            continue
        by_day = {}
        for b in bases(uid, first, end):
            by_day.setdefault(thai_day(b["occurred_at"]), b)
        required = 1 if kind == "first_day" else 5
        if len(by_day) < required:
            continue
        chosen = list(by_day.values())[required - 1]
        if any(
            e["user_id"] == uid
            and e.get("report_id") == chosen.get("report_id")
            and e["kind"] == kind
            for e in events
        ):
            continue
        actions.append(
            {
                "action": "grant",
                "user_id": uid,
                "report_id": chosen["report_id"],
                "kind": kind,
                "points": 5 if kind == "first_day" else 20,
                "reason": "first_day" if kind == "first_day" else "five_days",
                "occurred_at": chosen["occurred_at"],
                "policy_version": VERSION,
            }
        )
    return actions
