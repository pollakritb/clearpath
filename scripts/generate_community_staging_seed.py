"""Generate deterministic, synthetic community data for staging validation only."""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import NAMESPACE_URL, uuid5


def _id(kind: str, index: int) -> str:
    return str(uuid5(NAMESPACE_URL, f"https://clearpath.app/staging/{kind}/{index}"))


def build_dataset(reference_time: datetime) -> dict:
    """Return varied synthetic profiles/reports without contacting a database."""
    checked_at = reference_time.astimezone(UTC)
    scenarios = [
        ("corroborated-high", 88, 42.0, 5, 13.8199, 100.0622, "Meter A", True),
        ("corroborated-mid", 64, 44.0, 12, 13.8210, 100.0630, "Meter B", False),
        ("boundary-sixty", 60, 41.0, 179, 13.8240, 100.0650, "Meter C", False),
        ("below-threshold", 59, 39.0, 30, 18.7883, 98.9853, "Meter D", False),
        ("calibrated-eighty", 80, 28.0, 20, 7.8804, 98.3923, "Meter E", True),
        ("expired", 92, 31.0, 181, 16.4419, 102.8350, "Meter F", True),
        ("near-emission", 95, 120.0, 8, 14.9930, 102.1020, "Meter G", True),
        ("pending-review", 35, None, 3, 13.7563, 100.5018, "Meter H", False),
    ]
    profiles = []
    reports = []
    for index, scenario in enumerate(scenarios, start=1):
        (
            label,
            trust,
            pm25,
            age_minutes,
            lat,
            lon,
            device_model,
            calibrated,
        ) = scenario
        user_id = _id("profile", index)
        profiles.append(
            {
                "id": user_id,
                "display_name": f"Staging Tester {index}",
                "role": "user",
                "reputation_score": (index - 1) * 20,
                "test_data": True,
            }
        )
        reports.append(
            {
                "id": _id("report", index),
                "user_id": user_id,
                "scenario": label,
                "status": "pending" if pm25 is None else "approved",
                "pm25": pm25,
                "trust_score": trust,
                "lat": lat,
                "lon": lon,
                "captured_at": (
                    checked_at - timedelta(minutes=age_minutes)
                ).isoformat(),
                "device_model": device_model,
                "device_calibrated": calibrated,
                "gps_accuracy_m": 220 if label == "below-threshold" else 25,
                "near_emission_source": label == "near-emission",
                "duplicate_detected": False,
                "test_data": True,
            }
        )
    return {
        "environment": "staging",
        "generated_at": checked_at.isoformat(),
        "synthetic_only": True,
        "profiles": profiles,
        "reports": reports,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate synthetic ClearPath community staging data"
    )
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument(
        "--reference-time",
        default=datetime.now(UTC).replace(microsecond=0).isoformat(),
    )
    args = parser.parse_args()
    reference_time = datetime.fromisoformat(args.reference_time.replace("Z", "+00:00"))
    if reference_time.tzinfo is None:
        reference_time = reference_time.replace(tzinfo=UTC)
    args.output.write_text(
        json.dumps(build_dataset(reference_time), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
