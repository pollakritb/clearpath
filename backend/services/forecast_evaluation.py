"""Settle forecast observations and persist aggregate accuracy metrics."""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime, timedelta

from ..algorithms.forecast_monitoring import (
    aggregate_settled,
    evaluation_alert_codes,
    settle_prediction,
)
from . import forecast_monitoring, retention, supabase_client

EVALUATION_HORIZONS = frozenset({1, 3, 6, 12, 24})


def _fallback_rate(members: list[dict], method: str) -> float:
    # A shadow prediction exists only when shadow inference succeeded. The served
    # run may still carry the intentional baseline fallback reason.
    if "shadow" in method:
        return 0.0
    return sum(
        bool((member.get("forecast_runs") or {}).get("fallback_reason"))
        for member in members
    ) / len(members)


def settle_due_predictions(limit: int = 500) -> dict:
    rows = supabase_client.get_unsettled_forecast_predictions(limit)
    settled = 0
    observation_missing = 0
    invalid = 0
    for row in rows:
        run = row.get("forecast_runs") or {}
        station_id = str(run.get("station_id") or "")
        observation = supabase_client.get_observation_near(
            station_id, str(row["forecast_at"])
        )
        if not observation:
            observation_missing += 1
            continue
        try:
            metrics = settle_prediction(row, float(observation["pm25"]))
        except (KeyError, TypeError, ValueError):
            invalid += 1
            continue
        supabase_client.settle_forecast_prediction(
            str(row["run_id"]),
            int(row["horizon_hours"]),
            str(row.get("variant") or "served"),
            {
                **metrics,
                "observed_at": observation["recorded_at"],
                "settled_at": datetime.now(UTC).isoformat(),
            },
        )
        settled += 1
    return {
        "due": len(rows),
        "settled": settled,
        "observation_missing": observation_missing,
        "invalid": invalid,
    }


def aggregate_recent(days: int = 7) -> dict:
    since = datetime.now(UTC) - timedelta(days=days)
    rows = supabase_client.list_settled_forecast_predictions(since.isoformat())
    groups: dict[tuple[str, str, int, str, str, str], list[dict]] = defaultdict(list)
    for row in rows:
        horizon = int(row["horizon_hours"])
        # Forecast responses expose every hour, while the production monitoring
        # schema intentionally stores only the product/release-gate horizons.
        # Filtering here keeps hourly predictions settleable without violating
        # forecast_evaluation_daily_horizon_hours_check.
        if horizon not in EVALUATION_HORIZONS:
            continue
        run = row.get("forecast_runs") or {}
        date = str(row.get("forecast_at") or "")[:10]
        prefix = (
            date,
            str(run.get("environment") or "unknown"),
            horizon,
            str(row.get("method") or "unknown"),
        )
        station_id = str(run.get("station_id") or "unknown")
        district = str(run.get("district") or "unknown")
        groups[(*prefix, station_id, district)].append(row)
        groups[(*prefix, "all", district)].append(row)
        groups[(*prefix, "all", "all")].append(row)
    output = []
    for (
        date,
        environment,
        horizon,
        method,
        station_id,
        district,
    ), members in sorted(groups.items()):
        metrics = aggregate_settled(members)
        latencies = sorted(
            float((member.get("forecast_runs") or {}).get("latency_ms"))
            for member in members
            if (member.get("forecast_runs") or {}).get("latency_ms") is not None
        )
        p95_latency = (
            latencies[max(0, int(len(latencies) * 0.95) - 1)] if latencies else None
        )
        fallback_rate = _fallback_rate(members, method)
        output.append(
            {
                "evaluation_date": date,
                "environment": environment,
                "horizon_hours": horizon,
                "method": method,
                "station_id": station_id,
                "district": district,
                **{
                    name: metrics[name]
                    for name in (
                        "rows",
                        "mae",
                        "rmse",
                        "bias",
                        "category_accuracy",
                        "false_safe_rate",
                        "interval_coverage",
                    )
                },
                "fallback_rate": fallback_rate,
                "p95_latency_ms": p95_latency,
                "metrics": metrics,
                "computed_at": datetime.now(UTC).isoformat(),
            }
        )
    supabase_client.upsert_forecast_evaluation(output)
    return {"source_rows": len(rows), "aggregate_rows": len(output)}


def weekly_metrics(days: int = 7) -> dict:
    """Compute a rolling weekly view without replacing immutable daily rows."""

    since = datetime.now(UTC) - timedelta(days=days)
    rows = supabase_client.list_settled_forecast_predictions(since.isoformat())
    groups: dict[tuple[str, int, str, str, str], list[dict]] = defaultdict(list)
    for row in rows:
        horizon = int(row["horizon_hours"])
        if horizon not in EVALUATION_HORIZONS:
            continue
        run = row.get("forecast_runs") or {}
        prefix = (
            str(run.get("environment") or "unknown"),
            horizon,
            str(row.get("method") or "unknown"),
        )
        station_id = str(run.get("station_id") or "unknown")
        district = str(run.get("district") or "unknown")
        groups[(*prefix, station_id, district)].append(row)
        groups[(*prefix, "all", district)].append(row)
        groups[(*prefix, "all", "all")].append(row)
    summaries = []
    for (environment, horizon, method, station_id, district), members in sorted(
        groups.items()
    ):
        latencies = sorted(
            float((member.get("forecast_runs") or {}).get("latency_ms"))
            for member in members
            if (member.get("forecast_runs") or {}).get("latency_ms") is not None
        )
        fallback_rate = _fallback_rate(members, method)
        summaries.append(
            {
                "environment": environment,
                "horizon_hours": horizon,
                "method": method,
                "station_id": station_id,
                "district": district,
                **aggregate_settled(members),
                "fallback_rate": fallback_rate,
                "p95_latency_ms": (
                    latencies[max(0, int(len(latencies) * 0.95) - 1)]
                    if latencies
                    else None
                ),
            }
        )
    return {"days": days, "source_rows": len(rows), "rows": summaries}


def monitoring_alerts(settlement: dict, weekly: dict, drift: dict) -> dict:
    rows = [
        row
        for row in weekly.get("rows", [])
        if row.get("station_id") == "all" and row.get("district") == "all"
    ]
    alerts = set(drift.get("alert_codes", []))
    evaluations = []
    for candidate in (row for row in rows if "xgboost" in str(row.get("method"))):
        baseline = next(
            (
                row
                for row in rows
                if row.get("horizon_hours") == candidate.get("horizon_hours")
                and "xgboost" not in str(row.get("method"))
            ),
            None,
        )
        result = evaluation_alert_codes(candidate, baseline)
        alerts.update(result["alert_codes"])
        evaluations.append({"horizon_hours": candidate["horizon_hours"], **result})
    due = int(settlement.get("due", 0))
    missing = int(settlement.get("observation_missing", 0))
    if due >= 30 and missing / due > 0.2:
        alerts.add("forecast_observation_settlement_missing")
    return {"alert_codes": sorted(alerts), "evaluations": evaluations}


def run_evaluation() -> dict:
    settlement = settle_due_predictions()
    aggregation = aggregate_recent()
    weekly = weekly_metrics()
    drift = forecast_monitoring.run_drift_snapshot()
    return {
        "settlement": settlement,
        "aggregation": aggregation,
        "weekly": weekly,
        "drift": drift,
        "alerts": monitoring_alerts(settlement, weekly, drift),
        "retention": retention.cleanup_forecast_telemetry(),
    }
