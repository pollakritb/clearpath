"""Read-only four-station CAMS/Air4Thai field evidence export.

This intentionally does not score PM2.5 forecast accuracy: the Air4Thai
history endpoint labels one-hour values, but the label's averaging-window
boundary has not been independently confirmed. The output is gitignored.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import UTC, datetime, timedelta, timezone
from math import isfinite
from pathlib import Path
from urllib.parse import urlparse

import httpx

from backend.algorithms.distance import haversine_km
from backend.core.config import settings
from backend.services.air4thai import _air4thai_tls_context
from backend.services.supabase_client import get_client

EXPECTED_REF = "qnrtryspglioqhdxglzu"
STATION_IDS = ("103t", "73t", "78t", "102t")
AIR4THAI_HISTORY_URL = "https://air4thai.pcd.go.th/webV2/history/api/data.php"
BANGKOK = timezone(timedelta(hours=7), "Asia/Bangkok")


def utc_time(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("timestamp_without_offset")
    return parsed.astimezone(UTC)


def checked_project_ref() -> str:
    hostname = urlparse(settings.supabase_url).hostname or ""
    ref = hostname.removesuffix(".supabase.co")
    if (
        hostname != f"{EXPECTED_REF}.supabase.co"
        or not settings.supabase_service_role_key
    ):
        raise SystemExit(
            "Refusing read: expected the configured ClearPath Supabase project"
        )
    return ref


def fetch_snapshots(station_id: str, cutoff: datetime) -> list[dict]:
    client = get_client()
    rows = []
    for offset in range(0, 10000, 1000):
        page = (
            client.table("forecast_provider_snapshots")
            .select(
                "station_id,provider,issued_at,forecast_at,horizon_hours,pm25,unit,raw_metadata"
            )
            .eq("provider", "openmeteo_cams")
            .eq("station_id", station_id)
            .gte("issued_at", cutoff.isoformat())
            .order("issued_at", desc=True)
            .range(offset, offset + 999)
            .execute()
            .data
            or []
        )
        rows.extend(page)
        if len(page) < 1000:
            return rows
    raise RuntimeError(f"snapshot_page_limit_exceeded:{station_id}")


def normalize_snapshot(row: dict) -> dict | None:
    try:
        metadata = row.get("raw_metadata") or {}
        requested_lat = float(metadata["requested_lat"])
        requested_lon = float(metadata["requested_lon"])
        grid_lat = float(metadata["grid_lat"])
        grid_lon = float(metadata["grid_lon"])
        pm25 = float(row["pm25"])
        issued = utc_time(row["issued_at"])
        valid = utc_time(row["forecast_at"])
        fetched = utc_time(metadata.get("fetched_at") or row["issued_at"])
        if not all(
            isfinite(number)
            for number in (requested_lat, requested_lon, grid_lat, grid_lon, pm25)
        ) or not (
            -90 <= requested_lat <= 90
            and -180 <= requested_lon <= 180
            and -90 <= grid_lat <= 90
            and -180 <= grid_lon <= 180
            and pm25 >= 0
        ):
            return None
    except (KeyError, TypeError, ValueError):
        return None
    return {
        "station_id": str(row["station_id"]),
        "requested_lat": requested_lat,
        "requested_lon": requested_lon,
        "grid_lat": grid_lat,
        "grid_lon": grid_lon,
        "grid_distance_km": round(
            haversine_km(requested_lat, requested_lon, grid_lat, grid_lon), 3
        ),
        "issued_at_utc": issued.isoformat(),
        "fetched_at_utc": fetched.isoformat(),
        "valid_at_utc": valid.isoformat(),
        "lead_hours": round((valid - fetched).total_seconds() / 3600, 4),
        "pm25_ug_m3": pm25,
        "unit": row.get("unit"),
        "domain": "cams_global",
        "issued_time_kind": metadata.get("issued_time_kind"),
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
                    "source_label_as_utc": local_label.replace(tzinfo=BANGKOK)
                    .astimezone(UTC)
                    .isoformat(),
                    "pm25_ug_m3": value,
                    "source_type": "air4thai_history_type_hr",
                    "window_semantics_verified": False,
                }
            )
    return result


def candidate_pairs(
    snapshots: list[dict], observations: list[dict], now: datetime
) -> list[dict]:
    """Find label-equal candidates only; never calculate accuracy metrics."""
    observed = {row["source_label_as_utc"]: row for row in observations}
    pairs = []
    for forecast in snapshots:
        valid = utc_time(forecast["valid_at_utc"])
        fetched = utc_time(forecast["fetched_at_utc"])
        actual = observed.get(forecast["valid_at_utc"])
        if not actual or not fetched < valid <= now:
            continue
        pairs.append(
            {
                "station_id": forecast["station_id"],
                "fetched_at_utc": forecast["fetched_at_utc"],
                "valid_at_utc": forecast["valid_at_utc"],
                "lead_hours": forecast["lead_hours"],
                "forecast_pm25_ug_m3": forecast["pm25_ug_m3"],
                "air4thai_hourly_label": actual["source_label_local"],
                "air4thai_pm25_ug_m3": actual["pm25_ug_m3"],
                "scorable": False,
                "reason": "hourly_timestamp_window_semantics_unverified",
            }
        )
    return pairs


def collect(days: int, now: datetime) -> dict:
    project_ref = checked_project_ref()
    station_rows = (
        get_client()
        .table("stations")
        .select("id,name_th,name_en,lat,lon,province,recorded_at")
        .in_("id", list(STATION_IDS))
        .execute()
        .data
        or []
    )
    stations = {str(row["id"]): row for row in station_rows}
    if set(stations) != set(STATION_IDS):
        raise RuntimeError("four_station_cohort_incomplete")
    raw = {
        station_id: fetch_snapshots(station_id, now - timedelta(days=days))
        for station_id in STATION_IDS
    }
    snapshots = {
        station_id: [
            normalized
            for row in raw[station_id]
            if (normalized := normalize_snapshot(row)) is not None
        ]
        for station_id in STATION_IDS
    }
    if any(not rows for rows in snapshots.values()):
        raise RuntimeError("cams_snapshots_missing_for_cohort")
    first_local = min(
        utc_time(row["valid_at_utc"]).astimezone(BANGKOK).date()
        for rows in snapshots.values()
        for row in rows
    )
    last_local = now.astimezone(BANGKOK).date()
    if (last_local - first_local).days > days + 1:
        raise RuntimeError("air4thai_history_window_too_large")
    observations = fetch_hourly_history(first_local.isoformat(), last_local.isoformat())
    pairs = {
        station_id: candidate_pairs(
            snapshots[station_id], observations[station_id], now
        )
        for station_id in STATION_IDS
    }
    station_summaries = []
    for station_id in STATION_IDS:
        latest = max(snapshots[station_id], key=lambda row: row["issued_at_utc"])
        grids = sorted(
            {(row["grid_lat"], row["grid_lon"]) for row in snapshots[station_id]}
        )
        station_summaries.append(
            {
                "station_id": station_id,
                "name_en": stations[station_id].get("name_en"),
                "province": stations[station_id].get("province"),
                "requested_lat": latest["requested_lat"],
                "requested_lon": latest["requested_lon"],
                "latest_grid_lat": latest["grid_lat"],
                "latest_grid_lon": latest["grid_lon"],
                "latest_grid_distance_km": latest["grid_distance_km"],
                "distinct_grid_count": len(grids),
                "snapshot_count": len(snapshots[station_id]),
                "invalid_snapshot_count": len(raw[station_id])
                - len(snapshots[station_id]),
                "hourly_label_count": len(observations[station_id]),
                "candidate_pair_count": len(pairs[station_id]),
                "latest_snapshot_fetched_at_utc": latest["fetched_at_utc"],
                "latest_snapshot_valid_at_utc": latest["valid_at_utc"],
            }
        )
    return {
        "study": "cams_air4thai_four_station_field_trial_v1",
        "collected_at_utc": now.isoformat(),
        "supabase_project_ref": project_ref,
        "read_only": True,
        "sources": {
            "cams": "ClearPath private forecast_provider_snapshots, provider=openmeteo_cams",
            "air4thai": AIR4THAI_HISTORY_URL,
            "air4thai_query_type": "hr",
        },
        "limitations": [
            "Air4Thai hourly label's averaging-window boundary is unverified.",
            "CAMS hourly API values derive from a coarser native CAMS Global model.",
            "Grid-centre distance is not a PM2.5 forecast accuracy score.",
            "No MAE, bias, or model calibration is calculated or claimed.",
        ],
        "station_summary": station_summaries,
        "snapshots": snapshots,
        "air4thai_hourly_labels": observations,
        "candidate_pairs_unscored": pairs,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--days", type=int, default=7)
    parser.add_argument("--output", type=Path, default=Path(".forecast-validation"))
    args = parser.parse_args()
    if not 1 <= args.days <= 7:
        parser.error("--days must be 1..7, matching snapshot retention")
    now = datetime.now(UTC).replace(microsecond=0)
    evidence = collect(args.days, now)
    args.output.mkdir(parents=True, exist_ok=True)
    path = args.output / f"cams-four-station-{now:%Y%m%dT%H%M%SZ}.json"
    payload = json.dumps(evidence, ensure_ascii=False, indent=2).encode("utf-8")
    path.write_bytes(payload)
    print(
        json.dumps(
            {
                "file": str(path),
                "sha256": hashlib.sha256(payload).hexdigest(),
                "bytes": len(payload),
                "supabase_project_ref": evidence["supabase_project_ref"],
                "stations": evidence["station_summary"],
                "accuracy_status": "not_scorable_hourly_timestamp_window_unverified",
            },
            ensure_ascii=True,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
