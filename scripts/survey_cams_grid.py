"""One-shot CAMS grid survey. Never writes to Supabase or public forecasts.

Staging: set STAGING_SUPABASE_URL and STAGING_SUPABASE_SERVICE_ROLE_KEY, then
run ``python -m scripts.survey_cams_grid --expected-ref <ClearPath staging ref>``.
Local smoke: ``python -m scripts.survey_cams_grid --demo`` (labelled demo).
Output stays in the gitignored .forecast-validation directory.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import json
import os
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlparse


def _configure_source(demo: bool, expected_ref: str | None) -> str:
    if demo:
        os.environ["LOCAL_DEMO_MODE"] = "true"
        os.environ["APP_ENVIRONMENT"] = "development"
        return "local_demo_not_all_air4thai_stations"
    url = os.environ.get("STAGING_SUPABASE_URL", "")
    key = os.environ.get("STAGING_SUPABASE_SERVICE_ROLE_KEY", "")
    hostname = urlparse(url).hostname or ""
    actual_ref = hostname.removesuffix(".supabase.co")
    local_production_ref = ""
    env_file = Path(".env.local")
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if line.startswith("SUPABASE_URL="):
                local_production_ref = (
                    urlparse(line.partition("=")[2].strip().strip('"')).hostname or ""
                ).removesuffix(".supabase.co")
                break
    if (
        not expected_ref
        or not key
        or not hostname.endswith(".supabase.co")
        or actual_ref != expected_ref
        or actual_ref == local_production_ref
        or os.environ.get("APP_ENVIRONMENT", "").lower() != "staging"
    ):
        raise SystemExit(
            "Staging guard failed: require APP_ENVIRONMENT=staging, staging credentials, "
            "and an exact matching --expected-ref. Production is never accepted."
        )
    os.environ["SUPABASE_URL"] = url
    os.environ["SUPABASE_SERVICE_ROLE_KEY"] = key
    os.environ["LOCAL_DEMO_MODE"] = "false"
    return f"clearpath_staging:{actual_ref}"


async def _survey(source: str, output: Path) -> dict:
    from backend.algorithms.distance import haversine_km
    from backend.algorithms.external_forecast import select_hourly_rows
    from backend.algorithms.forecast_validation import survey_summary
    from backend.services import openmeteo_air, supabase_client

    now = datetime.now(UTC)
    stations = supabase_client.get_stations()
    rows: list[dict] = []
    eligible = []
    for station in stations:
        row = {
            "station_id": str(station.get("id") or ""),
            "requested_lat": station.get("lat"),
            "requested_lon": station.get("lon"),
        }
        try:
            lat, lon = float(row["requested_lat"]), float(row["requested_lon"])
            if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                raise ValueError("out_of_range")
        except (TypeError, ValueError):
            rows.append(
                {**row, "status": "missing", "reason": "invalid_station_coordinates"}
            )
            continue
        eligible.append({"id": row["station_id"], "lat": lat, "lon": lon})

    for offset in range(0, len(eligible), 50):
        batch = eligible[offset : offset + 50]
        try:
            forecasts = await openmeteo_air.get_forecasts(batch, forecast_hours=4)
        except Exception:
            rows.extend(
                {
                    "station_id": station["id"],
                    "requested_lat": station["lat"],
                    "requested_lon": station["lon"],
                    "status": "unavailable",
                    "reason": "provider_unavailable",
                }
                for station in batch
            )
            continue
        for station in batch:
            provider_rows = forecasts.get(station["id"], [])
            selected = select_hourly_rows(provider_rows, 1, now=now)
            if not selected:
                rows.append(
                    {
                        "station_id": station["id"],
                        "requested_lat": station["lat"],
                        "requested_lon": station["lon"],
                        "status": "missing",
                        "reason": "no_future_pm25",
                    }
                )
                continue
            point = selected[0]
            grid_lat, grid_lon = point.get("source_lat"), point.get("source_lon")
            distance = (
                haversine_km(
                    station["lat"], station["lon"], float(grid_lat), float(grid_lon)
                )
                if grid_lat is not None and grid_lon is not None
                else None
            )
            rows.append(
                {
                    "station_id": station["id"],
                    "requested_lat": station["lat"],
                    "requested_lon": station["lon"],
                    "grid_lat": grid_lat,
                    "grid_lon": grid_lon,
                    "distance_km": distance,
                    "fetched_at": point["fetched_at"],
                    "valid_at": point["forecast_at"],
                    "pm25_ug_m3": point["pm25"],
                    "status": "ok" if distance is not None else "missing",
                    "reason": None if distance is not None else "grid_missing",
                }
            )
        if offset + 50 < len(eligible):
            await asyncio.sleep(1)

    report = {"source": source, "surveyed_at": now.isoformat(), **survey_summary(rows)}
    output.mkdir(parents=True, exist_ok=True)
    stamp = now.strftime("%Y%m%dT%H%M%SZ")
    stem = output / f"cams-grid-survey-{stamp}"
    fields = [
        "station_id",
        "requested_lat",
        "requested_lon",
        "grid_lat",
        "grid_lon",
        "distance_km",
        "fetched_at",
        "valid_at",
        "pm25_ug_m3",
        "status",
        "reason",
    ]
    with stem.with_suffix(".csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    stem.with_suffix(".json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return {
        "report": str(stem.with_suffix(".json")),
        "rows": str(stem.with_suffix(".csv")),
        **report,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--demo", action="store_true")
    parser.add_argument("--expected-ref")
    parser.add_argument("--output", type=Path, default=Path(".forecast-validation"))
    args = parser.parse_args()
    source = _configure_source(args.demo, args.expected_ref)
    print(
        json.dumps(
            asyncio.run(_survey(source, args.output)), ensure_ascii=False, indent=2
        )
    )


if __name__ == "__main__":
    main()
