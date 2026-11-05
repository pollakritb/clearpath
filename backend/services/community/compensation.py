"""Automatic compensation from independent findings; no Admin write endpoint."""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from ...algorithms.community_xp import stamp, thai_day
from ..record_keys import creation_key
from . import policy_v2


def reconcile_demo() -> int:
    from . import xp

    with xp._LOCK:
        invalid = {
            r["report_id"]
            for r in policy_v2.DEMO_OUTCOMES
            if r["outcome"] == "problem" and r.get("invalidates_contribution")
        }
        count = 0
        for event in list(xp._EVENTS):
            if (
                event.get("policy_version") == "contribution-v2"
                and event["kind"] in {"report", "help"}
                and event.get("report_id") in invalid
                and event["points"] > 0
                and not any(r.get("reverses") == event["id"] for r in xp._EVENTS)
            ):
                xp.reverse_event(
                    event["id"],
                    "independent-confirmed-invalid-contribution",
                    "automatic-evidence-worker",
                )
                count += 1

        def live():
            reversed_ids = {e.get("reverses") for e in xp._EVENTS}
            return [
                e
                for e in xp._EVENTS
                if e["points"] > 0
                and e.get("policy_version") == "contribution-v2"
                and e["id"] not in reversed_ids
            ]

        for event in list(live()):
            if event["kind"] not in {"first_day", "contribution_week"}:
                continue
            local = stamp(event["occurred_at"]).astimezone(ZoneInfo("Asia/Bangkok"))
            start = (
                local.date()
                if event["kind"] == "first_day"
                else (local - timedelta(days=local.weekday())).date()
            )
            end = start + timedelta(days=1 if event["kind"] == "first_day" else 7)
            days = {
                thai_day(e["occurred_at"])
                for e in live()
                if e["kind"] == "report"
                and e["user_id"] == event["user_id"]
                and start.isoformat() <= thai_day(e["occurred_at"]) < end.isoformat()
            }
            if len(days) < (1 if event["kind"] == "first_day" else 5):
                xp.reverse_event(
                    event["id"],
                    "dependent-contribution-bonus-no-longer-earned",
                    "automatic-evidence-worker",
                )
                count += 1
        groups = {}
        for event in live():
            if event["kind"] != "report":
                continue
            local = stamp(event["occurred_at"]).astimezone(ZoneInfo("Asia/Bangkok"))
            groups.setdefault(
                (event["user_id"], (local - timedelta(days=local.weekday())).date()), []
            ).append(event)
        for (uid, monday), events in groups.items():
            daily = {
                thai_day(e["occurred_at"]): e
                for e in sorted(events, key=lambda e: e["occurred_at"], reverse=True)
            }
            awards = [("first_day", 5, day, event) for day, event in daily.items()]
            if len(daily) >= 5:
                awards.append(
                    (
                        "contribution_week",
                        20,
                        monday.isoformat(),
                        max(events, key=lambda e: e["occurred_at"]),
                    )
                )
            for kind, points, key, event in awards:
                if any(
                    e["user_id"] == uid
                    and e["kind"] == kind
                    and (
                        thai_day(e["occurred_at"]) == key
                        if kind == "first_day"
                        else monday.isoformat()
                        <= thai_day(e["occurred_at"])
                        < (monday + timedelta(days=7)).isoformat()
                    )
                    for e in live()
                ):
                    continue
                xp._EVENTS.append(
                    dict(
                        id=creation_key("community_xp_events"),
                        user_id=uid,
                        report_id=event["report_id"],
                        kind=kind,
                        points=points,
                        reason="first_day" if kind == "first_day" else "five_days",
                        occurred_at=event["occurred_at"],
                        recorded_at=datetime.now(UTC).isoformat(),
                        policy_version="contribution-v2",
                    )
                )
        return count
