"""Aggregate a private, de-identified co-location CSV into calibration evidence."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path

from backend.algorithms.device_colocation import (
    evaluate_device_colocation,
    validate_colocation_columns,
)


def evaluate_file(path: Path, **policy: float | int) -> dict:
    raw = path.read_bytes()
    reader = csv.DictReader(raw.decode("utf-8-sig").splitlines())
    validate_colocation_columns(reader.fieldnames or [])
    result = evaluate_device_colocation(list(reader), **policy)
    return {
        "input_sha256": hashlib.sha256(raw).hexdigest(),
        "input_filename": path.name,
        **result,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--minimum-duration-hours", type=float, required=True)
    parser.add_argument("--minimum-pairs", type=int, required=True)
    parser.add_argument("--maximum-gap-minutes", type=float, required=True)
    parser.add_argument("--minimum-rows-per-band", type=int, required=True)
    parser.add_argument("--maximum-absolute-bias", type=float, required=True)
    parser.add_argument("--maximum-mae", type=float, required=True)
    parser.add_argument("--maximum-false-safe-rate", type=float, required=True)
    args = parser.parse_args()
    policy = {
        "minimum_duration_hours": args.minimum_duration_hours,
        "minimum_pairs": args.minimum_pairs,
        "maximum_gap_minutes": args.maximum_gap_minutes,
        "minimum_rows_per_band": args.minimum_rows_per_band,
        "maximum_absolute_bias": args.maximum_absolute_bias,
        "maximum_mae": args.maximum_mae,
        "maximum_false_safe_rate": args.maximum_false_safe_rate,
    }
    try:
        result = evaluate_file(args.input_csv, **policy)
    except (OSError, UnicodeError, ValueError) as exc:
        result = {"ready": False, "error": str(exc).split(":", 1)[0]}
    rendered = json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True)
    if args.output:
        args.output.write_text(rendered + "\n", encoding="utf-8")
    else:
        print(rendered)
    return 0 if result["ready"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
