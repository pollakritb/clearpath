"""Read-only production configuration and Supabase schema preflight."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

from dotenv import dotenv_values

from backend.core.config import Settings

REQUIRED_TABLES = (
    "stations",
    "pm25_readings",
    "profiles",
    "capture_sessions",
    "report_drafts",
    "report_evidence",
    "community_reports",
    "report_reviews",
    "rate_limit_windows",
    "sync_runs",
    "audit_logs",
    "data_issue_reports",
    "notification_preferences",
    "push_subscriptions",
    "notification_outbox",
    "model_registry",
    "forecast_data_quality_daily",
    "forecast_runs",
    "forecast_predictions",
    "forecast_false_safe_reviews",
    "forecast_evaluation_daily",
    "forecast_drift_snapshots",
    "forecast_release_decisions",
    "forecast_provider_sync_runs",
    "forecast_provider_snapshots",
    "forecast_consensus_latest",
    "forecast_prediction_sources",
    "community_forecast_feature_snapshots",
)


def _environment(env_file: Path) -> dict[str, str]:
    values = {
        key: str(value)
        for key, value in dotenv_values(env_file).items()
        if value is not None
    }
    values.update(os.environ)
    return values


def _configured(values: dict[str, str], key: str, *, minimum: int = 1) -> bool:
    return len(values.get(key, "").strip()) >= minimum


def run_preflight(
    *, strict_features: bool = False, env_file: Path = Path(".env.local")
) -> dict:
    values = _environment(env_file)
    runtime_settings = Settings(_env_file=env_file)
    checks: dict[str, bool] = {
        "app_environment_production": values.get("APP_ENVIRONMENT") == "production",
        "supabase_server_credentials": _configured(values, "SUPABASE_URL")
        and _configured(values, "SUPABASE_SERVICE_ROLE_KEY", minimum=20),
        "supabase_browser_credentials": _configured(values, "NEXT_PUBLIC_SUPABASE_URL")
        and _configured(values, "NEXT_PUBLIC_SUPABASE_ANON_KEY", minimum=20),
        "cron_secret": _configured(values, "CRON_SECRET", minimum=32),
        "dedicated_capture_secret": _configured(
            values, "CAPTURE_SESSION_SECRET", minimum=32
        )
        and values.get("CAPTURE_SESSION_SECRET")
        not in {
            values.get("CRON_SECRET"),
            values.get("SUPABASE_SERVICE_ROLE_KEY"),
        },
        "cors_allowlist": bool(runtime_settings.allowed_cors_origins)
        and "*" not in runtime_settings.allowed_cors_origins,
    }
    feature_checks = {
        "automatic_review_ocr": not runtime_settings.automatic_review_enabled
        or _configured(values, "OPENAI_API_KEY", minimum=20),
        "web_push": not runtime_settings.push_enabled
        or all(
            _configured(values, key, minimum=10)
            for key in ("VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT")
        ),
        "ml_runtime_registry": not runtime_settings.ml_forecast_enabled,
        "openweather_provider": not runtime_settings.openweather_air_enabled
        or _configured(values, "OPENWEATHER_API_KEY", minimum=16),
        "community_forecast_shadow_only": values.get(
            "COMMUNITY_FORECAST_SHADOW_ENABLED", "false"
        )
        .strip()
        .lower()
        not in {"1", "true", "yes", "on"},
        "ml_canary_percentage_valid": 0
        <= runtime_settings.ml_forecast_canary_percentage
        <= 100,
    }

    table_checks: dict[str, bool] = {}
    table_error_types: dict[str, int] = {}
    supabase_error: str | None = None
    if checks["supabase_server_credentials"]:
        try:
            from supabase import create_client

            client = create_client(
                values["SUPABASE_URL"], values["SUPABASE_SERVICE_ROLE_KEY"]
            )
            for table in REQUIRED_TABLES:
                try:
                    client.table(table).select("*", count="exact").limit(0).execute()
                    table_checks[table] = True
                except Exception as exc:
                    table_checks[table] = False
                    error_type = type(exc).__name__
                    table_error_types[error_type] = (
                        table_error_types.get(error_type, 0) + 1
                    )
            if runtime_settings.ml_forecast_enabled:
                active_rows = (
                    client.table("model_registry")
                    .select(
                        "horizon_hours,artifact_sha256,feature_schema_sha256,"
                        "dataset_manifest_sha256,code_release_sha"
                    )
                    .eq("environment", "production")
                    .eq("activation_status", "active")
                    .execute()
                ).data or []
                integrity_fields = (
                    "artifact_sha256",
                    "feature_schema_sha256",
                    "dataset_manifest_sha256",
                    "code_release_sha",
                )
                feature_checks["ml_runtime_registry"] = {
                    int(row["horizon_hours"])
                    for row in active_rows
                    if all(row.get(field) for field in integrity_fields)
                } == {1, 3, 6, 12, 24}
        except Exception as exc:
            supabase_error = type(exc).__name__
    checks["supabase_schema"] = bool(table_checks) and all(table_checks.values())
    evaluated = {**checks, **(feature_checks if strict_features else {})}
    return {
        "ready": all(evaluated.values()),
        "checks": checks,
        "feature_checks": feature_checks,
        "tables": table_checks,
        "table_error_types": table_error_types,
        "supabase_error_type": supabase_error,
        "notes": [
            "This command is read-only and never prints secret values.",
            "Use --strict-features before public launch.",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--strict-features", action="store_true")
    parser.add_argument(
        "--env-file", type=Path, default=Path(".env.local"), help="env file to inspect"
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="accepted for explicitness; output is always JSON",
    )
    args = parser.parse_args()
    result = run_preflight(
        strict_features=args.strict_features,
        env_file=args.env_file,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if result["ready"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
