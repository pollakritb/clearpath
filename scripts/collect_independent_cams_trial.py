"""Collect four-station field-test evidence without reading or writing Production.

One invocation makes a new CAMS Global request and saves its raw hourly values
alongside Air4Thai hourly labels in a gitignored, local-only JSON file. Run it
every six hours for seven days using a *separate* test scheduler. This module
does not start a background service or schedule itself.
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
from datetime import UTC, datetime, timedelta, timezone
from math import isfinite
from pathlib import Path

import httpx

from backend.algorithms.distance import haversine_km
from backend.algorithms.external_forecast import select_hourly_rows
from backend.core.config import settings
from backend.services import openmeteo_air
from backend.services.air4thai import _air4thai_tls_context

# Fixed public station coordinates from the 2026-10-18 four-station baseline.
# This collector never connects to Supabase; record these inputs in every run.
STATIONS = (
    {"id": "103t", "lat": 12.577835, "lon": 99.953663},
    {"id": "73t", "lat": 20.427325, "lon": 99.883842},
    {"id": "78t", "lat": 5.763873, "lon": 101.067903},
    {"id": "102t", "lat": 16.54257, "lon": 104.7192},
)
STATION_IDS = tuple(row["id"] for row in STATIONS)
DEFAULT_OUTPUT = Path(".forecast-validation/independent-four-station")
AIR4THAI_HISTORY_URL = "https://air4thai.pcd.go.th/webV2/history/api/data.php"
THAI_TIME = timezone(timedelta(hours=7))
TRIAL_START_UTC = datetime(2026, 10, 18, 12, tzinfo=UTC)
TRIAL_END_UTC = TRIAL_START_UTC + timedelta(days=7)


def _slot(now: datetime) -> datetime:
    utc = now.astimezone(UTC)
    return utc.replace(hour=utc.hour // 6 * 6, minute=0, second=0, microsecond=0)


def _normalize(rows: list[dict], station: dict, now: datetime) -> dict:
    selected = select_hourly_rows(rows, 24, now=now)
    grid_lat = selected[0].get("source_lat") if selected else None
    grid_lon = selected[0].get("source_lon") if selected else None
    distance = (
        round(
            haversine_km(
                station["lat"], station["lon"], float(grid_lat), float(grid_lon)
            ),
            3,
        )
        if grid_lat is not None and grid_lon is not None
        else None
    )
    points = [
        {
            "valid_at_utc": row["forecast_at"],
            "fetched_at_utc": row["fetched_at"],
            "pm25_ug_m3": row["pm25"],
        }
        for row in selected
    ]
    return {
        "station_id": station["id"],
        "requested_lat": station["lat"],
        "requested_lon": station["lon"],
        "grid_lat": grid_lat,
        "grid_lon": grid_lon,
        "grid_distance_km": distance,
        "status": "complete"
        if len(points) == 24 and distance is not None
        else "partial",
        "forecast_hour_count": len(points),
        "forecast_hours": points,
    }


def fetch_hourly_history(start_date: str, end_date: str) -> dict[str, list[dict]]:
    with httpx.Client(timeout=35.0, verify=_air4thai_tls_context()) as client:
        response = client.get(
            AIR4THAI_HISTORY_URL,
            params={
                "stationID": ",".join(STATION_IDS),
                "param": "PM25",
                "type": "hr",
                "sdate": start_date,
                "edate": end_date,
                "stime": "00",
                "etime": "24",
            },
        )
        response.raise_for_status()
        payload = response.json()
    if not isinstance(payload.get("stations"), list):
        raise RuntimeError("air4thai_history_shape_unexpected")
    result: dict[str, list[dict]] = {station_id: [] for station_id in STATION_IDS}
    for station in payload["stations"]:
        station_id = str(station.get("stationID"))
        if station_id not in result:
            continue
        for reading in station.get("data", []):
            try:
                local_label = datetime.fromisoformat(str(reading["DATETIMEDATA"]))
                value = float(reading["PM25"])
                if not isfinite(value) or value < 0:
                    continue
            except (KeyError, TypeError, ValueError):
                continue
            result[station_id].append(
                {
                    "station_id": station_id,
                    "source_label_local": local_label.isoformat(sep=" "),
                    "source_label_as_utc": local_label.replace(tzinfo=THAI_TIME)
                    .astimezone(UTC)
                    .isoformat(),
                    "pm25_ug_m3": value,
                    "window_semantics_verified": False,
                }
            )
    return result


async def collect(now: datetime) -> dict:
    if settings.is_production:
        raise RuntimeError("independent_trial_refuses_production_runtime")
    forecasts = await openmeteo_air.get_forecasts(list(STATIONS), forecast_hours=28)
    if set(forecasts) != set(STATION_IDS):
        raise RuntimeError("provider_returned_incomplete_station_set")
    local_date = (now + timedelta(hours=7)).date()
    history = fetch_hourly_history(
        (local_date - timedelta(days=2)).isoformat(), local_date.isoformat()
    )
    rows = [_normalize(forecasts[station["id"]], station, now) for station in STATIONS]
    return {
        "study": "independent_cams_air4thai_four_station_trial_v1",
        "collected_at_utc": now.isoformat(),
        "collection_slot_utc": _slot(now).isoformat(),
        "production_supabase_access": False,
        "production_forecast_reads": False,
        "production_forecast_writes": False,
        "cams_source": openmeteo_air.URL,
        "cams_domain": "cams_global",
        "air4thai_history_type": "hr",
        "hourly_timestamp_window_semantics_verified": False,
        "accuracy_metrics_enabled": False,
        "stations": rows,
        "air4thai_hourly_labels": history,
    }


def save(evidence: dict, output: Path) -> dict:
    output.mkdir(parents=True, exist_ok=True)
    slot = datetime.fromisoformat(evidence["collection_slot_utc"])
    path = output / f"trial-{slot:%Y%m%dT%H0000Z}.json"
    payload = json.dumps(evidence, ensure_ascii=False, indent=2).encode("utf-8")
    # A retry must never replace a forecast previously captured in this slot.
    with path.open("xb") as handle:
        handle.write(payload)
    return {
        "file": str(path),
        "bytes": len(payload),
        "sha256": hashlib.sha256(payload).hexdigest(),
        "collection_slot_utc": evidence["collection_slot_utc"],
        "station_count": len(evidence["stations"]),
        "forecast_hour_counts": {
            row["station_id"]: row["forecast_hour_count"]
            for row in evidence["stations"]
        },
        "production_supabase_access": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    now = datetime.now(UTC).replace(microsecond=0)
    if not TRIAL_START_UTC <= now < TRIAL_END_UTC:
        print("Independent seven-day trial window has ended; no request made.")
        return
    destination = args.output / f"trial-{_slot(now):%Y%m%dT%H0000Z}.json"
    if destination.exists():
        print(
            f"Trial slot already captured; existing evidence preserved: {destination}"
        )
        return
    result = save(asyncio.run(collect(now)), args.output)
    print(json.dumps(result, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
