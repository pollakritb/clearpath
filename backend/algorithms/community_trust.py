"""community-trust-v1: deterministic ledger replay; no I/O or publication decisions."""

from collections import defaultdict
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

POLICY = "community-trust-v1"
THAI = ZoneInfo("Asia/Bangkok")


def stamp(value) -> datetime:
    parsed = (
        value
        if isinstance(value, datetime)
        else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    )
    if parsed.tzinfo is None:
        raise ValueError("timestamp_requires_timezone")
    return parsed.astimezone(UTC)


def project(
    events: list[dict], *, now: datetime, include_private: bool = False
) -> dict:
    today = now.astimezone(THAI).date()
    start = today - timedelta(days=89)
    ordered = sorted(events, key=lambda e: int(e["seq"]))
    invalid = {}
    holds = {}
    for event in ordered:
        payload = event.get("payload") or {}
        if event["action"] == "finding" and payload.get("outcome") != "unresolved":
            for seq in payload.get("target_sequences", []):
                invalid[int(seq)] = payload["outcome"] == "invalid"
        if event["action"] == "hold":
            for seq in payload.get("target_sequences", []):
                # Each event is paused only once. A later wave cannot extend it.
                holds.setdefault(int(seq), stamp(payload["until"]))
    slots = {}
    for event in ordered:
        if (
            event["action"] not in {"set", "withdraw"}
            or invalid.get(int(event["seq"]))
            or (event.get("payload") or {}).get("accepted") is False
        ):
            continue
        key = (
            str(event["voter_id"]),
            str(event["reporter_id"]),
            str(event["vote_day"]),
        )
        current = slots.get(key)
        if event["action"] == "withdraw" or not event.get("eligible"):
            if current and str(current["report_id"]) == str(event["report_id"]):
                slots[key] = None
        else:
            slots[key] = event
    active = []
    pending = False
    for (_, _, day), event in slots.items():
        if not event or not start.isoformat() <= day <= today.isoformat():
            continue
        if holds.get(int(event["seq"]), now) > now:
            pending = True
            continue
        active.append(event)
    days = defaultdict(list)
    for event in active:
        days[str(event["vote_day"])].append(event)
    daily = []
    numerator = denominator = 0
    for day, rows in sorted(days.items()):
        positive = sum(e["reaction"] == "like" for e in rows)
        n = len(rows)
        value, weight = 100 * positive / n, min(n, 3)
        numerator += value * weight
        denominator += weight
        daily.append(
            {
                "day": day,
                "positive": positive,
                "negative": n - positive,
                "count": n,
                "value": value,
                "weight": weight,
            }
        )
    voters = len({str(e["voter_id"]) for e in active})
    reports = len({str(e["report_id"]) for e in active})
    enough = voters >= 3 and reports >= 3 and len(daily) >= 3
    result = dict(
        policy_version=POLICY,
        status="updating" if pending else "available" if enough else "insufficient",
        score=numerator / denominator if enough else None,
        window_start=start.isoformat(),
        window_end=today.isoformat(),
        unique_voter_accounts=voters,
        evaluated_report_count=reports,
        evaluated_day_count=len(daily),
        effective_day_weight=denominator,
        last_feedback_at=max((str(e["created_at"]) for e in active), default=None),
        calculated_at=now.isoformat(),
        daily=daily,
        comparison={
            "raw": 100 * sum(e["reaction"] == "like" for e in active) / len(active)
            if active
            else None,
            "equal_day": sum(d["value"] for d in daily) / len(daily) if daily else None,
        },
    )
    if include_private:
        result["_slots"] = [
            dict(
                voter_id=e["voter_id"],
                vote_day=e["vote_day"],
                event_seq=e["seq"],
                report_id=e["report_id"],
            )
            for e in slots.values()
            if e is not None
        ]
    return result
