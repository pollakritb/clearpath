"""Aggregate private field CSV into a non-identifying comparison report."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path

from backend.algorithms.field_validation import (
    compare_field_variants,
    validate_field_columns,
)


def evaluate_file(
    path: Path,
    *,
    minimum_slice_rows: int,
    max_mae_regression_percent: float,
    max_false_safe_rate_delta: float,
) -> dict:
    raw = path.read_bytes()
    text = raw.decode("utf-8-sig")
    reader = csv.DictReader(text.splitlines())
    validate_field_columns(reader.fieldnames or [])
    result = compare_field_variants(
        list(reader),
        minimum_slice_rows=minimum_slice_rows,
        max_mae_regression_fraction=max_mae_regression_percent / 100,
        max_false_safe_rate_delta=max_false_safe_rate_delta,
    )
    return {
        "input_sha256": hashlib.sha256(raw).hexdigest(),
        "input_filename": path.name,
        **result,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_csv", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--minimum-slice-rows", type=int, required=True)
    parser.add_argument("--max-mae-regression-percent", type=float, required=True)
    parser.add_argument("--max-false-safe-rate-delta", type=float, required=True)
    args = parser.parse_args()
    try:
        result = evaluate_file(
            args.input_csv,
            minimum_slice_rows=args.minimum_slice_rows,
            max_mae_regression_percent=args.max_mae_regression_percent,
            max_false_safe_rate_delta=args.max_false_safe_rate_delta,
        )
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
