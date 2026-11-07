"""community-trust-v1: deterministic ledger replay; no I/O or publication decisions."""

from collections import defaultdict
from datetime import UTC, datetime, timedelta
from math import isfinite
from zoneinfo import ZoneInfo

from .distance import haversine_km

POLICY = "community-trust-v1"
THAI = ZoneInfo("Asia/Bangkok")
NEGATIVE_REASONS = {"report_context_doubt", "image_context_doubt"}
NON_TRUST_REASONS = {
    "ocr_mismatch",
    "system_display_issue",
    "station_disagreement_only",
    "cannot_assess",
}


def stamp(value) -> datetime:
    parsed = (
        value
        if isinstance(value, datetime)
        else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    )
    if parsed.tzinfo is None:
        raise ValueError("timestamp_requires_timezone")
    return parsed.astimezone(UTC)


def vote_eligibility(
    report: dict,
    voter: str,
    fix: dict,
    reaction: str,
    reason: str | None,
    *,
    now: datetime,
    evidence_available: bool,
) -> tuple[str | None, dict]:
    """Keep only decision evidence; never return the voter's coordinates."""
    audit = {"policy_version": POLICY, "checked_at": now.isoformat()}
    if str(report["user_id"]) == str(voter):
        return "self_vote", audit
    if report.get("status") != "approved":
        return "report_not_approved", audit
    if not evidence_available or report.get("evidence_purged_at"):
        return "evidence_unavailable", audit
    try:
        age = (now - stamp(report["captured_at"])).total_seconds()
        audit["report_age_seconds"] = age
        if not 0 <= age <= 10800:
            return "report_expired", audit
        lat, lon, accuracy = [float(fix[k]) for k in ("lat", "lon", "accuracy_m")]
        if not all(isfinite(x) for x in (lat, lon, accuracy)) or not (
            -90 <= lat <= 90 and -180 <= lon <= 180 and accuracy >= 0
        ):
            return "gps_invalid", audit
        fix_age = (now - stamp(fix["observed_at"])).total_seconds()
        audit.update(accuracy_m=accuracy, fix_age_seconds=fix_age)
        if fix_age < 0:
            return "gps_clock_invalid", audit
        if fix_age > 120:
            return "gps_expired", audit
        distance = 1000 * haversine_km(
            lat, lon, float(report["lat"]), float(report["lon"])
        )
        audit["distance_m"] = distance
        if distance + accuracy > 500:
            return (
                "gps_uncertain" if distance - accuracy <= 500 else "outside_area",
                audit,
            )
    except (ValueError, KeyError, TypeError, OverflowError):
        return "gps_invalid", audit
    if reaction == "dislike" and reason not in NEGATIVE_REASONS:
        return "reason_not_trust", audit
    return None, audit


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
