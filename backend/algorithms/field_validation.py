"""Pure aggregate comparison for official-only vs community-supplemented field data."""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Mapping, Sequence

from .district import DISTRICTS
from .forecast_baselines import evaluate_predictions

REQUIRED_FIELDS = {
    "observed_pm25",
    "official_only_pm25",
    "official_community_pm25",
    "district",
    "season",
    "sparse_area",
    "horizon_hours",
}
FORBIDDEN_PRIVATE_FIELDS = {
    "email",
    "image",
    "image_path",
    "lat",
    "latitude",
    "lon",
    "longitude",
    "precise_coordinates",
    "report_id",
    "user_id",
}
VALID_HORIZONS = {1, 3, 6, 12, 24}
VALID_SEASONS = {"dry", "rainy"}


def validate_field_columns(columns: Sequence[str]) -> None:
    normalized = {str(column).strip().lower() for column in columns}
    if forbidden := sorted(normalized & FORBIDDEN_PRIVATE_FIELDS):
        raise ValueError(f"private_columns_forbidden:{','.join(forbidden)}")
    if missing := sorted(REQUIRED_FIELDS - normalized):
        raise ValueError(f"required_columns_missing:{','.join(missing)}")


def _boolean(value: object) -> bool:
    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes"}:
        return True
    if normalized in {"0", "false", "no"}:
        return False
    raise ValueError("sparse_area_invalid")


def _normalized_records(records: Sequence[Mapping[str, object]]) -> list[dict]:
    output = []
    for record in records:
        district = str(record.get("district") or "").strip()
        season = str(record.get("season") or "").strip().lower()
        horizon = int(record.get("horizon_hours") or 0)
        if district not in DISTRICTS:
            raise ValueError(f"district_invalid:{district or 'missing'}")
        if season not in VALID_SEASONS:
            raise ValueError(f"season_invalid:{season or 'missing'}")
        if horizon not in VALID_HORIZONS:
            raise ValueError(f"horizon_invalid:{horizon}")
        observed = float(record["observed_pm25"])
        official = float(record["official_only_pm25"])
        community = float(record["official_community_pm25"])
        if min(observed, official, community) < 0:
            raise ValueError("pm25_negative")
        output.append(
            {
                "observed_pm25": observed,
                "official_only_pm25": official,
                "official_community_pm25": community,
                "district": district,
                "season": season,
                "sparse_area": _boolean(record.get("sparse_area")),
                "horizon_hours": horizon,
            }
        )
    if not output:
        raise ValueError("field_rows_empty")
    return output


def compare_field_variants(
    records: Sequence[Mapping[str, object]],
    *,
    minimum_slice_rows: int,
    max_mae_regression_fraction: float,
    max_false_safe_rate_delta: float,
) -> dict:
    if minimum_slice_rows < 1:
        raise ValueError("minimum_slice_rows_invalid")
    if not 0 <= max_mae_regression_fraction <= 1:
        raise ValueError("mae_regression_policy_invalid")
    if not 0 <= max_false_safe_rate_delta <= 1:
        raise ValueError("false_safe_policy_invalid")
    rows = _normalized_records(records)
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for row in rows:
        groups[("all", "all")].append(row)
        groups[("district", row["district"])].append(row)
        groups[("season", row["season"])].append(row)
        groups[("coverage", "sparse" if row["sparse_area"] else "covered")].append(row)
        groups[("horizon", str(row["horizon_hours"]))].append(row)

    slices = []
    for (dimension, value), members in sorted(groups.items()):
        actual = [row["observed_pm25"] for row in members]
        official = evaluate_predictions(
            actual, [row["official_only_pm25"] for row in members]
        )
        community = evaluate_predictions(
            actual, [row["official_community_pm25"] for row in members]
        )
        mae_limit = official["mae"] * (1 + max_mae_regression_fraction)
        false_safe_limit = official["false_safe_rate"] + max_false_safe_rate_delta
        enough = len(members) >= minimum_slice_rows
        passed = bool(
            enough
            and community["mae"] <= mae_limit
            and community["false_safe_rate"] <= false_safe_limit
        )
        slices.append(
            {
                "dimension": dimension,
                "value": value,
                "rows": len(members),
                "sufficient_evidence": enough,
                "official_only": official,
                "official_community": community,
                "delta": {
                    "mae": community["mae"] - official["mae"],
                    "rmse": community["rmse"] - official["rmse"],
                    "category_accuracy": community["category_accuracy"]
                    - official["category_accuracy"],
                    "false_safe_rate": community["false_safe_rate"]
                    - official["false_safe_rate"],
                },
                "policy_passed": passed,
            }
        )

    required = {
        *(f"district:{district}" for district in DISTRICTS),
        "season:dry",
        "season:rainy",
        "coverage:sparse",
        "coverage:covered",
        *(f"horizon:{horizon}" for horizon in sorted(VALID_HORIZONS)),
    }
    by_key = {
        f"{row['dimension']}:{row['value']}": row
        for row in slices
        if row["dimension"] != "all"
    }
    missing_or_insufficient = sorted(
        key
        for key in required
        if key not in by_key or not by_key[key]["sufficient_evidence"]
    )
    failed_slices = sorted(
        f"{row['dimension']}:{row['value']}"
        for row in slices
        if row["sufficient_evidence"] and not row["policy_passed"]
    )
    return {
        "ready": not missing_or_insufficient and not failed_slices,
        "row_count": len(rows),
        "policy": {
            "minimum_slice_rows": minimum_slice_rows,
            "max_mae_regression_fraction": max_mae_regression_fraction,
            "max_false_safe_rate_delta": max_false_safe_rate_delta,
        },
        "missing_or_insufficient_slices": missing_or_insufficient,
        "failed_slices": failed_slices,
        "slices": slices,
    }
