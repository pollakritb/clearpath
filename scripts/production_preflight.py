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
    "notification_outbox",
    "forecast_provider_sync_runs",
    "forecast_provider_snapshots",
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


def optional_tables(config: Settings) -> tuple[str, ...]:
    tables = []
    if config.account_privacy_enabled:
        tables.append("account_privacy_requests")
    if config.cams_grid_collection_enabled:
        tables.extend(
            (
                "cams_grid_jobs",
                "cams_grid_chunks",
                "cams_grid_generations",
                "cams_grid_frames",
                "cams_grid_active",
                "cams_grid_definitions",
            )
        )
    return tuple(tables)


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
        "automatic_review_ocr": _configured(values, "OPENAI_API_KEY", minimum=20),
        "retired_forecast_flags_disabled": not any(
            values.get(key, "false").strip().lower() in {"1", "true", "yes", "on"}
            for key in (
                "ML_FORECAST_ENABLED",
                "ML_FORECAST_SHADOW_ENABLED",
                "GISTDA_AIR_ENABLED",
                "COMMUNITY_FORECAST_SHADOW_ENABLED",
            )
        ),
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
            v2_tables = (
                (
                    "community_policy_release",
                    "community_evidence_outcomes",
                    "community_device_evaluations",
                    "community_coverage_missions",
                    "community_season_results",
                )
                if runtime_settings.community_v2_enabled
                else ()
            )
            for table in (
                *REQUIRED_TABLES,
                *v2_tables,
                *optional_tables(runtime_settings),
            ):
                try:
                    client.table(table).select("*", count="exact").limit(0).execute()
                    table_checks[table] = True
                except Exception as exc:
                    table_checks[table] = False
                    error_type = type(exc).__name__
                    table_error_types[error_type] = (
                        table_error_types.get(error_type, 0) + 1
                    )
        except Exception as exc:
            supabase_error = type(exc).__name__
    checks["supabase_schema"] = bool(table_checks) and all(table_checks.values())
    if runtime_settings.community_v2_enabled:
        checks["community_v2_dependencies"] = (
            runtime_settings.community_xp_enabled
            and runtime_settings.measurement_requests_enabled
            and runtime_settings.measurement_registered_locations_enabled
        )
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
