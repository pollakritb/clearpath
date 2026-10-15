"""Shadow-only evaluation of private CAMS field evidence in ClearPath Staging."""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path

from .survey_cams_grid import _configure_source


def _paged(table: str) -> list[dict]:
    from backend.services.supabase_client import get_client

    results = []
    for offset in range(0, 200_000, 1000):
        page = (
            get_client()
            .table(table)
            .select("*")
            .range(offset, offset + 999)
            .execute()
            .data
            or []
        )
        results.extend(page)
        if len(page) < 1000:
            break
    return results


def _geographic_region(lat: float, lon: float) -> str:
    """Broad coordinate cohorts, not an administrative province classification."""

    if lat < 11:
        return "south_coordinate_band"
    if lat >= 17:
        return "north_coordinate_band"
    if lat >= 14.5 and lon >= 101:
        return "northeast_coordinate_band"
    if lat < 14.5 and lon >= 101:
        return "east_coordinate_band"
    return "central_west_coordinate_band"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-ref", required=True)
    parser.add_argument(
        "--output", type=Path, default=Path(".forecast-validation/cams-accuracy.json")
    )
    args = parser.parse_args()
    source = _configure_source(False, args.expected_ref)
    from backend.algorithms.cams_accuracy import grouped_metrics, held_out_comparison
    from backend.algorithms.forecast_validation import validation_pairs

    snapshots = _paged("forecast_validation_snapshots")
    observations = _paged("forecast_validation_hourly_observations")
    for row in snapshots:
        if (
            row.get("requested_lat") is not None
            and row.get("requested_lon") is not None
        ):
            row["region"] = _geographic_region(
                float(row["requested_lat"]), float(row["requested_lon"])
            )
    pairs = validation_pairs(snapshots, observations)
    report = {
        "source": source,
        "evaluated_at": datetime.now(UTC).isoformat(),
        "snapshot_count": len(snapshots),
        "verified_observation_count": sum(
            row.get("timestamp_semantics_verified") is True for row in observations
        ),
        "pair_count": len(pairs),
        "observation_definition": "CAMS point at valid_at compared with official 1h mean ending at valid_at; not identical measurement windows",
        "raw_metrics": grouped_metrics(pairs),
        "status": "unavailable_no_verified_pairs" if not pairs else "descriptive_only",
        "holdout": {},
    }
    valid_hours = sorted({row["valid_at"] for row in pairs})
    if len(valid_hours) >= 14 * 24:
        cutoff = valid_hours[int(len(valid_hours) * 0.8)]
        report["cutoff"] = cutoff
        report["holdout"] = {
            station: held_out_comparison(pairs, cutoff, {station})
            for station in sorted({row["station_id"] for row in pairs})
        }
        report["status"] = "offline_comparison_only"
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(
        json.dumps(
            {
                "status": report["status"],
                "pair_count": len(pairs),
                "report": str(args.output),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
