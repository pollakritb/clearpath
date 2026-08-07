"""Export a read-only, point-in-time forecast dataset and signed manifest."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from collections import Counter
from pathlib import Path

from backend.algorithms.area import is_nakhon_pathom
from backend.algorithms.forecast_dataset import join_hourly_sources
from backend.algorithms.forecast_features import FEATURE_VERSION
from backend.algorithms.forecast_quality import (
    build_dataset_manifest,
    canonical_sha256,
    evaluate_forecast_row,
    parse_timestamp,
)
from backend.services.supabase_client import get_client

HORIZONS = (1, 3, 6, 12, 24)


def _fetch(
    table: str,
    columns: str,
    since: str,
    *,
    timestamp_column: str = "recorded_at",
) -> list[dict]:
    client = get_client()
    rows: list[dict] = []
    page_size = 1000
    while True:
        page = (
            client.table(table)
            .select(columns)
            .gte(timestamp_column, since)
            .order(timestamp_column)
            .range(len(rows), len(rows) + page_size - 1)
            .execute()
        ).data or []
        rows.extend(page)
        if len(page) < page_size:
            return rows


def _fields() -> list[str]:
    fields = [
        "station_id",
        "station_lat",
        "station_lon",
        "district",
        "recorded_at",
        "pm25",
        "weather_status",
        "weather_source_at",
        "temperature",
        "humidity",
        "wind_speed",
        "wind_deg",
        "rain_mm",
        "fire_status",
        "fire_source_at",
        "hotspot_count",
        "weighted_frp",
        "upwind_hotspot_count",
    ]
    for horizon in HORIZONS:
        fields.extend(
            [
                f"forecast_weather_status_h{horizon}",
                f"forecast_weather_issued_at_h{horizon}",
                *[
                    f"forecast_{name}_h{horizon}"
                    for name in (
                        "temperature",
                        "humidity",
                        "wind_speed",
                        "wind_deg",
                        "rain_mm",
                    )
                ],
            ]
        )
    return fields


def export(since: str, output: Path) -> dict:
    # Fail before any query if the timestamp cannot be reproduced precisely.
    parse_timestamp(since)
    client = get_client()
    stations = (
        client.table("stations").select("id,lat,lon,district").execute().data or []
    )
    station_metadata = {
        str(row["id"]): row
        for row in stations
        if is_nakhon_pathom(float(row["lat"]), float(row["lon"]))
    }
    selected = set(station_metadata)
    readings = [
        row
        for row in _fetch("pm25_readings", "station_id,recorded_at,pm25", since)
        if str(row["station_id"]) in selected
    ]
    weather = [
        row
        for row in _fetch(
            "weather_observations",
            "station_id,recorded_at,temperature,humidity,wind_speed,wind_deg,rain_mm",
            since,
        )
        if str(row["station_id"]) in selected
    ]
    fire = [
        row
        for row in _fetch(
            "fire_feature_snapshots",
            "station_id,recorded_at,hotspot_count,weighted_frp,upwind_hotspot_count",
            since,
        )
        if str(row["station_id"]) in selected
    ]
    weather_forecasts = [
        row
        for row in _fetch(
            "weather_forecasts",
            "station_id,issued_at,forecast_at,temperature,humidity,wind_speed,wind_deg,rain_mm",
            since,
            timestamp_column="forecast_at",
        )
        if str(row["station_id"]) in selected
    ]
    joined = join_hourly_sources(
        readings,
        weather,
        fire,
        weather_forecasts,
        station_metadata=station_metadata,
        horizons=HORIZONS,
    )

    usable_keys: set[tuple[str, int]] = set()
    excluded: Counter[str] = Counter()
    for row in joined:
        quality = evaluate_forecast_row(row)
        if quality["usable"]:
            usable_keys.add(
                (
                    str(row["station_id"]),
                    int(parse_timestamp(row["recorded_at"]).timestamp() // 3600),
                )
            )
        else:
            excluded.update(quality["reasons"])

    output.parent.mkdir(parents=True, exist_ok=True)
    fields = _fields()
    with output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(joined)

    manifest = build_dataset_manifest(
        joined,
        usable_keys=usable_keys,
        excluded_reasons=excluded,
        feature_version=FEATURE_VERSION,
    )
    total = len(joined)
    manifest.update(
        {
            "since": parse_timestamp(since).isoformat(),
            "csv_path": output.as_posix(),
            "csv_sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
            "weather_completeness": (
                sum(row["weather_status"] == "observed" for row in joined) / total
                if total
                else 0.0
            ),
            "fire_completeness": (
                sum(row["fire_status"] == "observed" for row in joined) / total
                if total
                else 0.0
            ),
            "forecast_weather_completeness": {
                str(horizon): (
                    sum(
                        row[f"forecast_weather_status_h{horizon}"] == "observed"
                        for row in joined
                    )
                    / total
                    if total
                    else 0.0
                )
                for horizon in HORIZONS
            },
        }
    )
    unsigned = {
        key: value for key, value in manifest.items() if key != "manifest_sha256"
    }
    manifest["manifest_sha256"] = canonical_sha256(unsigned)
    manifest_path = output.with_suffix(".manifest.json")
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    return {
        "rows": total,
        "usable_station_hours": manifest["usable_station_hours"],
        "usable_stations": manifest["usable_station_count"],
        "raw_completeness": manifest["raw_completeness"],
        "weather_completeness": manifest["weather_completeness"],
        "fire_completeness": manifest["fire_completeness"],
        "output": str(output),
        "manifest": str(manifest_path),
        "manifest_sha256": manifest["manifest_sha256"],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--since", required=True, help="ISO timestamp, ideally >= 6 months"
    )
    parser.add_argument(
        "--output", type=Path, default=Path("data/forecast_training.csv")
    )
    args = parser.parse_args()
    print(json.dumps(export(args.since, args.output), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
