"""Privacy-safe map grouping rules; callers must supply exact coordinates privately."""

from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime

from .community_quality import pm25_values_compatible
from .distance import haversine_km

STACK_MAX_DISTANCE_M = 300.0
STACK_MAX_AGE_MINUTES = 180.0
AVERAGE_MAX_AGE_MINUTES = 60.0
AVERAGE_MAX_GPS_ACCURACY_M = 50.0


def _captured_at(row: dict) -> datetime | None:
    try:
        value = datetime.fromisoformat(str(row["captured_at"]).replace("Z", "+00:00"))
        return value.astimezone(UTC) if value.tzinfo else value.replace(tzinfo=UTC)
    except (KeyError, TypeError, ValueError):
        return None


def _accuracy(row: dict) -> float | None:
    try:
        value = float(row["gps_accuracy_m"])
        return value if 0 <= value <= 200 else None
    except (KeyError, TypeError, ValueError):
        return None


def _distance_m(first: dict, second: dict) -> float:
    return 1000 * haversine_km(
        float(first["lat"]),
        float(first["lon"]),
        float(second["lat"]),
        float(second["lon"]),
    )


def _can_stack(first: dict, second: dict) -> bool:
    first_accuracy, second_accuracy = _accuracy(first), _accuracy(second)
    return (
        first_accuracy is not None
        and second_accuracy is not None
        and _distance_m(first, second) + first_accuracy + second_accuracy
        <= STACK_MAX_DISTANCE_M
    )


def _reading_status(
    members: list[dict], now: datetime
) -> tuple[str, float | None, list[str]]:
    latest_by_user: dict[str, dict] = {}
    for row in members:
        captured = _captured_at(row)
        accuracy = _accuracy(row)
        if (
            captured is None
            or accuracy is None
            or accuracy > AVERAGE_MAX_GPS_ACCURACY_M
        ):
            continue
        age_minutes = (now - captured).total_seconds() / 60
        if not -5 <= age_minutes <= AVERAGE_MAX_AGE_MINUTES:
            continue
        if (
            row.get("measurement_environment", "outdoor") != "outdoor"
            or not row.get("measurement_stable", True)
            or row.get("near_emission_source")
            or row.get("duplicate_of_report_id")
        ):
            continue
        user_id = str(row["user_id"])
        if user_id not in latest_by_user or captured > _captured_at(
            latest_by_user[user_id]
        ):
            latest_by_user[user_id] = row

    selected = list(latest_by_user.values())
    selected_ids = [str(row["id"]) for row in selected]
    values = [float(row["pm25"]) for row in selected]
    if not values:
        return "older", None, []
    if len(values) == 1:
        return "single", values[0], selected_ids
    if any(
        not pm25_values_compatible(left, right)
        for index, left in enumerate(values)
        for right in values[index + 1 :]
    ):
        return "mixed", None, selected_ids
    return "average", round(sum(values) / len(values), 1), selected_ids


def group_report_stacks(
    reports: Sequence[dict], *, now: datetime | None = None
) -> list[dict]:
    """Group reports by complete-link distance, without exposing raw GPS coordinates."""
    checked_at = now or datetime.now(UTC)
    candidates: list[dict] = []
    for report in reports:
        captured = _captured_at(report)
        if (
            report.get("status") != "approved"
            or report.get("source_type", "individual") != "individual"
            or report.get("pm25") is None
            or _accuracy(report) is None
            or captured is None
        ):
            continue
        age_minutes = (checked_at - captured).total_seconds() / 60
        if -5 <= age_minutes <= STACK_MAX_AGE_MINUTES:
            candidates.append(report)
    candidates.sort(key=lambda row: (_captured_at(row), str(row["id"])), reverse=True)

    groups: list[list[dict]] = []
    for report in candidates:
        compatible = [
            group
            for group in groups
            if all(_can_stack(report, member) for member in group)
        ]
        if compatible:
            nearest = min(
                compatible,
                key=lambda group: (
                    sum(_distance_m(report, member) for member in group) / len(group)
                ),
            )
            nearest.append(report)
        else:
            groups.append([report])

    stacks: list[dict] = []
    for group in groups:
        if len(group) < 2:
            continue
        status, value, contributing_report_ids = _reading_status(group, checked_at)
        stacks.append(
            {
                "id": f"stack:{group[0]['id']}",
                "report_ids": [str(member["id"]) for member in group],
                "report_count": len(group),
                "reporter_count": len({str(member["user_id"]) for member in group}),
                "latest_captured_at": str(group[0]["captured_at"]),
                "pm25": value,
                "value_status": status,
                "contributing_count": len(contributing_report_ids),
                "contributing_report_ids": contributing_report_ids,
            }
        )
    return stacks
