"""Read-only Air4Thai hourly completeness scan for a fixed CAMS field cohort.

The historical endpoint's `type=hr` rows are used **only to count presence**.
Their timestamp-window semantics and reuse licence are not yet confirmed, so
this script never inserts observations or computes forecast accuracy.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx

from .survey_cams_grid import _configure_source

URL = "https://air4thai.pcd.go.th/webV2/history/api/data.php"


async def scan_history(
    stations: list[dict], start: str, end: str, expected_hours: int
) -> list[dict]:
    from backend.services.air4thai import _air4thai_tls_context

    results = []
    async with httpx.AsyncClient(
        timeout=35.0, verify=_air4thai_tls_context()
    ) as client:
        for offset in range(0, len(stations), 20):
            batch = stations[offset : offset + 20]
            ids = [str(row["id"]) for row in batch]
            try:
                response = await client.get(
                    URL,
                    params={
                        "stationID": ",".join(ids),
                        "param": "PM25",
                        "type": "hr",
                        "sdate": start,
                        "edate": end,
                        "stime": "00",
                        "etime": "24",
                    },
                )
                response.raise_for_status()
                payload = response.json()
                by_id = {
                    str(row.get("stationID")): row
                    for row in payload.get("stations", [])
                }
            except (httpx.HTTPError, ValueError, TypeError):
                by_id = {}
            for station in batch:
                identifier = str(station["id"])
                source = by_id.get(identifier)
                if source is None:
                    results.append(
                        {
                            **station,
                            "usable_hours": 0,
                            "completeness": 0,
                            "status": "history_unavailable",
                        }
                    )
                    continue
                hours = set()
                for reading in source.get("data", []):
                    try:
                        value = float(reading.get("PM25"))
                        timestamp = str(reading["DATETIMEDATA"])
                        if value >= 0 and start <= timestamp[:10] <= end:
                            hours.add(timestamp)
                    except (TypeError, ValueError, KeyError):
                        continue
                results.append(
                    {
                        **station,
                        "usable_hours": len(hours),
                        "completeness": min(1.0, len(hours) / expected_hours),
                        "status": "checked",
                    }
                )
            if offset + 20 < len(stations):
                await asyncio.sleep(1)
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--demo", action="store_true")
    parser.add_argument("--expected-ref")
    parser.add_argument(
        "--output", type=Path, default=Path(".forecast-validation/cams-cohort.json")
    )
    args = parser.parse_args()
    source = _configure_source(args.demo, args.expected_ref)
    from backend.algorithms.forecast_validation import select_cohort
    from backend.services.supabase_client import get_stations

    today_th = (datetime.now(UTC) + timedelta(hours=7)).date()
    end_day = today_th - timedelta(days=1)
    start_day = end_day - timedelta(days=6)
    stations = [
        {"id": str(row["id"]), "lat": row["lat"], "lon": row["lon"]}
        for row in get_stations()
        if row.get("id") and row.get("lat") is not None and row.get("lon") is not None
    ]
    results = asyncio.run(
        scan_history(stations, start_day.isoformat(), end_day.isoformat(), 7 * 24)
    )
    eligible = [row for row in results if row["completeness"] >= 0.8]
    cohort = select_cohort(eligible, 10)
    ready = len(cohort) == 10 and str(cohort[0]["id"]) == "103t"
    report = {
        "source": source,
        "window_local_dates": [start_day.isoformat(), end_day.isoformat()],
        "station_count": len(stations),
        "completeness_checked_count": sum(
            row["status"] == "checked" for row in results
        ),
        "eligible_count": len(eligible),
        "cohort_ready_for_review": ready,
        "cohort_ids": [row["id"] for row in cohort] if ready else [],
        "rows": results,
        "warning": "Hourly presence only. Timestamp-window semantics and licence unverified; no observation ingestion or MAE permitted.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        json.dumps(
            {
                key: report[key]
                for key in (
                    "source",
                    "station_count",
                    "eligible_count",
                    "cohort_ready_for_review",
                    "cohort_ids",
                )
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
