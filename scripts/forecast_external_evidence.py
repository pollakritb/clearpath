"""Validate owner/infrastructure/field evidence without inventing human approval."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

FORECAST_MIGRATION = Path(
    "supabase/migrations/20260803_forecast_production_hardening.sql"
)
PLACEHOLDERS = {"", "tbd", "todo", "unknown", "replace-me"}


def _value(data: dict[str, Any], path: str) -> Any:
    current: Any = data
    for part in path.split("."):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def _present(value: Any) -> bool:
    return value is not None and str(value).strip().lower() not in PLACEHOLDERS


def _all_present(data: dict[str, Any], *paths: str) -> bool:
    return all(_present(_value(data, path)) for path in paths)


def _owner(data: dict[str, Any], name: str) -> bool:
    prefix = f"owners.{name}"
    return _all_present(
        data, f"{prefix}.primary", f"{prefix}.backup", f"{prefix}.contact"
    )


def _timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(UTC)


def _shadow_window(data: dict[str, Any]) -> bool:
    start = _timestamp(_value(data, "reviews.shadow.started_at"))
    end = _timestamp(_value(data, "reviews.shadow.ended_at"))
    return bool(start and end and end > start and (end - start).days >= 14)


def _migration_matches(data: dict[str, Any], migration: Path) -> bool:
    if not migration.exists():
        return False
    expected = hashlib.sha256(migration.read_bytes()).hexdigest()
    return _value(data, "infrastructure.migration_sha256") == expected


def _devices_valid(data: dict[str, Any]) -> bool:
    devices = _value(data, "field.devices")
    return bool(
        isinstance(devices, list)
        and devices
        and all(
            isinstance(device, dict)
            and _present(device.get("serial"))
            and _present(device.get("calibration_certificate"))
            and _timestamp(device.get("calibrated_at"))
            and _timestamp(device.get("calibration_due_at"))
            for device in devices
        )
    )


def _number(data: dict[str, Any], path: str, minimum: float = 0) -> bool:
    value = _value(data, path)
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and value >= minimum
    )


def _false_safe_reviewed(data: dict[str, Any]) -> bool:
    total = _value(data, "reviews.shadow.false_safe_total")
    reviewed = _value(data, "reviews.shadow.false_safe_reviewed")
    return (
        isinstance(total, int)
        and total >= 0
        and isinstance(reviewed, int)
        and reviewed == total
        and _number(data, "reviews.shadow.settled_prediction_count", 1)
    )


def _health_sources(data: dict[str, Any]) -> bool:
    sources = _value(data, "security.health_sources")
    return bool(
        isinstance(sources, list)
        and sources
        and all(
            isinstance(source, str) and source.startswith("https://")
            for source in sources
        )
        and _value(data, "security.health_source_approved") is True
        and _all_present(data, "security.health_source_approver")
    )


def checks(
    migration: Path = FORECAST_MIGRATION,
) -> dict[str, Callable[[dict[str, Any]], bool]]:
    return {
        "FCAST-0001": lambda d: _owner(d, "product"),
        "FCAST-0002": lambda d: _owner(d, "data_ml"),
        "FCAST-0003": lambda d: _owner(d, "production_incident"),
        "FCAST-0004": lambda d: (
            _owner(d, "privacy_legal") and _owner(d, "health_communication")
        ),
        "FCAST-0007": lambda d: (
            _owner(d, "production_incident")
            and _value(d, "owners.production_incident.rollback_authority") is True
        ),
        "FCAST-0101": lambda d: (
            _all_present(
                d,
                "infrastructure.staging_project_ref",
                "infrastructure.production_project_ref",
            )
            and _value(d, "infrastructure.staging_project_ref")
            != _value(d, "infrastructure.production_project_ref")
        ),
        "FCAST-0102": lambda d: (
            _migration_matches(d, migration)
            and _value(d, "infrastructure.migration_guard_destructive") is False
            and _value(d, "infrastructure.staging_migration_applied") is True
            and _value(d, "infrastructure.production_migration_applied") is True
        ),
        "FCAST-0103": lambda d: (
            _value(d, "infrastructure.server_browser_project_match") is True
        ),
        "FCAST-0104": lambda d: (
            _value(d, "infrastructure.cron_secret_configured") is True
            and _value(d, "infrastructure.sync_schedule_minutes") == 60
            and _value(d, "infrastructure.alert_schedule_minutes") <= 30
            and _value(d, "infrastructure.evaluation_schedule_minutes") <= 60
        ),
        "FCAST-0105": lambda d: (
            _value(d, "infrastructure.openweather_key_configured") is True
            and _value(d, "infrastructure.firms_key_configured") is True
        ),
        "FCAST-0106": lambda d: (
            _value(d, "infrastructure.local_demo_disabled_staging") is True
            and _value(d, "infrastructure.local_demo_disabled_production") is True
        ),
        "FCAST-0107": lambda d: (
            _value(d, "infrastructure.cron_monitoring_enabled") is True
            and _value(d, "infrastructure.upstream_alert_tested") is True
        ),
        "FCAST-0910": lambda d: (
            _value(d, "reviews.wording.approved") is True
            and _all_present(
                d, "reviews.wording.approver", "reviews.wording.document_sha256"
            )
            and _timestamp(_value(d, "reviews.wording.approved_at")) is not None
        ),
        "FCAST-1005": _false_safe_reviewed,
        "FCAST-1008": lambda d: (
            _shadow_window(d) and _all_present(d, "reviews.shadow.release_decision_id")
        ),
        "FCAST-1103": lambda d: (
            _value(d, "reviews.canary.rollback_drill_passed") is True
            and _timestamp(_value(d, "reviews.canary.rollback_drill_at")) is not None
        ),
        "FCAST-1104": lambda d: (
            _value(d, "reviews.canary.log_violations") == 0
            and _number(d, "reviews.canary.log_sample_count", 1)
            and _all_present(d, "reviews.canary.log_audit_sha256")
        ),
        "FCAST-1206": lambda d: (
            _all_present(d, "operations.monthly_review_owner")
            and _timestamp(_value(d, "operations.next_review_at")) is not None
        ),
        "FCAST-1207": lambda d: (
            _value(d, "operations.alert_fallback_drill_passed") is True
            and _timestamp(_value(d, "operations.alert_fallback_drill_at")) is not None
        ),
        "FCAST-1209": lambda d: (
            _number(d, "operations.function_memory_mb", 1)
            and _number(d, "operations.p95_latency_ms", 0)
            and _number(d, "operations.monthly_cost_amount", 0)
            and _all_present(d, "operations.cost_currency", "operations.cost_period")
        ),
        "FCAST-1301": _devices_valid,
        "FCAST-1302": lambda d: (
            _number(d, "field.colocation_hours", 24)
            and _number(d, "field.colocation_paired_samples", 1)
        ),
        "FCAST-1303": lambda d: (
            _number(d, "field.dry_season_samples", 1)
            and _number(d, "field.wet_season_samples", 1)
        ),
        "FCAST-1304": lambda d: (
            _number(d, "field.districts_evaluated", 7)
            and _value(d, "field.sparse_area_evaluated") is True
        ),
        "FCAST-1305": lambda d: (
            _value(d, "field.official_community_comparison_complete") is True
            and _value(d, "field.community_safety_gate_passed") is True
        ),
        "FCAST-1307": lambda d: (
            _value(d, "field.privacy_review_approved") is True
            and _all_present(d, "field.privacy_review_approver")
        ),
        "FCAST-1403": lambda d: (
            _value(d, "security.production_mfa_verified") is True
            and _value(d, "security.least_privilege_reviewed") is True
        ),
        "FCAST-1406": lambda d: (
            _value(d, "security.incident_owner_disable_access_tested") is True
        ),
        "FCAST-1413": lambda d: (
            _value(d, "security.vendor_inventory_complete") is True
            and _value(d, "security.dpa_review_approved") is True
        ),
        "FCAST-1423": _health_sources,
    }


def evaluate(
    data: dict[str, Any], migration: Path = FORECAST_MIGRATION
) -> dict[str, Any]:
    if data.get("schema_version") != 1:
        return {
            "ready": False,
            "error": "unsupported_schema_version",
            "completed_tasks": [],
            "pending_tasks": list(checks(migration)),
        }
    results: dict[str, bool] = {}
    for task, check in checks(migration).items():
        try:
            results[task] = bool(check(data))
        except (KeyError, TypeError, ValueError):
            results[task] = False
    completed = [task for task, passed in results.items() if passed]
    pending = [task for task, passed in results.items() if not passed]
    return {
        "ready": not pending,
        "completed_count": len(completed),
        "pending_count": len(pending),
        "completed_tasks": completed,
        "pending_tasks": pending,
        "checks": results,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("evidence", type=Path)
    parser.add_argument("--migration", type=Path, default=FORECAST_MIGRATION)
    args = parser.parse_args()
    try:
        data = json.loads(args.evidence.read_text(encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError("evidence_must_be_json_object")
        result = evaluate(data, args.migration)
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        result = {"ready": False, "error": type(exc).__name__}
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if result["ready"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
