import csv

import pytest

from backend.algorithms.district import DISTRICTS
from backend.algorithms.field_validation import (
    compare_field_variants,
    validate_field_columns,
)


def _records(rows_per_slice: int = 2) -> list[dict]:
    rows = []
    for district in DISTRICTS:
        for season in ("dry", "rainy"):
            for sparse in (True, False):
                for horizon in (1, 3, 6, 12, 24):
                    for index in range(rows_per_slice):
                        observed = 30 + index
                        rows.append(
                            {
                                "observed_pm25": observed,
                                "official_only_pm25": observed + 4,
                                "official_community_pm25": observed + 2,
                                "district": district,
                                "season": season,
                                "sparse_area": sparse,
                                "horizon_hours": horizon,
                            }
                        )
    return rows


def test_field_comparison_requires_all_district_season_sparse_horizon_slices():
    result = compare_field_variants(
        _records(),
        minimum_slice_rows=2,
        max_mae_regression_fraction=0,
        max_false_safe_rate_delta=0,
    )
    assert result["ready"] is True
    assert result["missing_or_insufficient_slices"] == []
    assert result["failed_slices"] == []


def test_field_comparison_fails_when_community_regresses_a_slice():
    rows = _records()
    for row in rows:
        if row["district"] == DISTRICTS[0]:
            row["official_community_pm25"] = 0
    result = compare_field_variants(
        rows,
        minimum_slice_rows=2,
        max_mae_regression_fraction=0.05,
        max_false_safe_rate_delta=0,
    )
    assert result["ready"] is False
    assert f"district:{DISTRICTS[0]}" in result["failed_slices"]


def test_private_columns_are_rejected_before_field_analysis():
    with pytest.raises(ValueError, match="private_columns_forbidden"):
        validate_field_columns(
            [
                "observed_pm25",
                "official_only_pm25",
                "official_community_pm25",
                "district",
                "season",
                "sparse_area",
                "horizon_hours",
                "user_id",
                "latitude",
            ]
        )


def test_field_csv_headers_are_stable():
    headers = sorted(
        {
            "observed_pm25",
            "official_only_pm25",
            "official_community_pm25",
            "district",
            "season",
            "sparse_area",
            "horizon_hours",
        }
    )
    assert next(csv.reader([",".join(headers)])) == headers
