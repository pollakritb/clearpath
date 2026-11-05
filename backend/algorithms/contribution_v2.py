"""Versioned participation rules; no database, clock or network access."""

from datetime import datetime, timedelta
from math import isfinite

from .community_xp import base_eligibility, stamp, thai_day

VERSION = "contribution-v2"


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
        str(e.get("report_id")) == str(report["id"]) and e["kind"] == "report"
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
    if base and not any(
        e["kind"] == "first_day" and e.get("id") not in reversed_ids for e in daily
    ):
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
        and e.get("policy_version") == VERSION
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
            and e.get("id") not in reversed_ids
            and monday.isoformat() <= thai_day(e["occurred_at"]) <= day
            for e in own
        )
    ):
        result.append(dict(kind="contribution_week", points=20, reason="five_days"))
    return result
