"""One explainable Trust value per reporter, from independent audit cases only.

No report evidence, OCR approvals, votes, XP, station similarity or device accuracy
are inputs. Beta(2,2) is a candidate product prior, not a field-validated cutoff.
"""

from datetime import datetime
from math import isfinite

POLICY = "reporter-trust-v1"


def reporter_trust(rows: list[dict], *, now: datetime, prior: float = 2) -> dict:
    if now.tzinfo is None or not isfinite(prior) or prior <= 0:
        raise ValueError("aware time and positive finite prior required")
    latest: dict[str, dict] = {}
    for row in rows:
        if not all(
            row.get(k)
            for k in (
                "case_key",
                "sample_key",
                "evaluated_at",
                "evidence_ref",
                "evaluator_key",
            )
        ):
            continue
        try:
            at = datetime.fromisoformat(row["evaluated_at"].replace("Z", "+00:00"))
            revision = int(row["revision"])
            if at.tzinfo is None or at > now or revision < 1:
                continue
        except (ValueError, TypeError, KeyError):
            continue
        if row.get("outcome") not in {"pass", "problem", "unresolved"}:
            continue
        case = row["case_key"]
        old = latest.get(case)
        if old is None or revision > int(old["revision"]):
            latest[case] = row
        elif revision == int(old["revision"]) and row != old:
            raise ValueError("conflicting audit revision")
    grouped: dict[str, list[dict]] = {}
    excluded = 0
    for row in latest.values():
        if row.get("fault_domain") != "reporting":
            excluded += 1
            continue
        grouped.setdefault(row["sample_key"], []).append(row)
    counts = dict(passed=0, problems=0, unresolved=0)
    dates = []
    for group in grouped.values():
        # Correlated checks of the same sample are one conservative result.
        findings = {row["outcome"] for row in group}
        key = (
            "problems"
            if "problem" in findings
            else "unresolved"
            if "unresolved" in findings
            else "passed"
        )
        counts[key] += 1
        dates.extend(row["evaluated_at"] for row in group)
    n = counts["passed"] + counts["problems"]
    return {
        "policy_version": POLICY,
        "status": "evaluated" if n else "insufficient",
        "score": round(100 * (counts["passed"] + prior) / (n + 2 * prior), 1)
        if n
        else None,
        **counts,
        "evaluated": n,
        "excluded_cases": excluded,
        "first_checked_at": min(
            dates, key=lambda x: datetime.fromisoformat(x.replace("Z", "+00:00"))
        )
        if dates
        else None,
        "last_checked_at": max(
            dates, key=lambda x: datetime.fromisoformat(x.replace("Z", "+00:00"))
        )
        if dates
        else None,
        "prior_alpha": prior,
        "prior_beta": prior,
    }
