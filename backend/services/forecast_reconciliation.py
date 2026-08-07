"""Daily source/station/hour reconciliation for forecast readiness."""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta

from ..algorithms.forecast_monitoring import reconciliation_alert_codes
from ..algorithms.forecast_quality import parse_timestamp, validate_hourly_sequence
from . import supabase_client

SOURCES = ("pm25", "weather", "forecast_weather", "fire")


def reconcile_day(quality_date: date | None = None) -> dict:
    target_date = quality_date or datetime.now(UTC).date()
    start = datetime.combine(target_date, time.min, tzinfo=UTC)
    end = start + timedelta(days=1)
    now = datetime.now(UTC)
    expected_hours = (
        24
        if end <= now
        else max(0, min(24, int((now - start).total_seconds() // 3600) + 1))
    )
    stations = [str(row["id"]) for row in supabase_client.get_stations()]
    output = []
    for source in SOURCES:
        raw = supabase_client.list_source_quality_rows(
            source, start.isoformat(), end.isoformat()
        )
        # A forecast issue contains several future target rows; one issue-hour is
        # one ingestion event for reconciliation purposes.
        unique_rows = {}
        for row in raw:
            try:
                timestamp = parse_timestamp(row.get("recorded_at"))
            except (TypeError, ValueError):
                continue
            key = (str(row.get("station_id") or ""), int(timestamp.timestamp() // 3600))
            unique_rows.setdefault(key, row)
        by_station: dict[str, list[dict]] = defaultdict(list)
        for row in unique_rows.values():
            by_station[str(row.get("station_id") or "")].append(row)
        for station_id in stations:
            rows = by_station.get(station_id, [])
            sequence = validate_hourly_sequence(rows)
            invalid_rows = sum(
                str(row.get("source_status") or "observed") == "invalid" for row in rows
            )
            observed_hours = len(rows)
            newest = max(
                (str(row["recorded_at"]) for row in rows if row.get("recorded_at")),
                default=None,
            )
            output.append(
                {
                    "quality_date": target_date.isoformat(),
                    "source_name": source,
                    "station_id": station_id,
                    "expected_hours": expected_hours,
                    "observed_hours": observed_hours,
                    "missing_hours": max(0, expected_hours - observed_hours),
                    "duplicate_hours": sequence["duplicate_hours"],
                    "invalid_rows": invalid_rows,
                    "newest_source_at": newest,
                    "details": {"sequence_missing_hours": sequence["missing_hours"]},
                    "reconciled_at": now.isoformat(),
                }
            )
    supabase_client.upsert_forecast_data_quality(output)
    total_expected = sum(row["expected_hours"] for row in output)
    total_observed = sum(row["observed_hours"] for row in output)
    total_missing = sum(row["missing_hours"] for row in output)
    total_invalid = sum(row["invalid_rows"] for row in output)
    return {
        "quality_date": target_date.isoformat(),
        "sources": len(SOURCES),
        "stations": len(stations),
        "rows": len(output),
        "expected_hours": total_expected,
        "observed_hours": total_observed,
        "missing_hours": total_missing,
        "invalid_rows": total_invalid,
        "alert_codes": reconciliation_alert_codes(
            stations=len(stations),
            expected_hours=total_expected,
            missing_hours=total_missing,
            invalid_rows=total_invalid,
        ),
    }
