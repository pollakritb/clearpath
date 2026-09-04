"""Delete expired private community evidence according to moderation retention."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from ..core.config import settings
from . import supabase_client


def cleanup_expired_reports(limit: int = 200) -> dict:
    rows = supabase_client.list_expired_report_evidence(limit)
    deleted = 0
    failures = 0
    for row in rows:
        try:
            image_path = row.get("image_path")
            if image_path:
                supabase_client.delete_report_image(str(image_path))
            supabase_client.purge_report_evidence(str(row["report_id"]))
            deleted += 1
        except Exception:
            # Keep evidence metadata unpurged so the next scheduled run retries.
            failures += 1
    drafts = supabase_client.list_expired_report_drafts(limit)
    drafts_deleted = 0
    for draft in drafts:
        try:
            if not draft.get("submitted_at") and draft.get("image_path"):
                supabase_client.delete_report_image(str(draft["image_path"]))
            supabase_client.delete_expired_report_draft(str(draft["id"]))
            drafts_deleted += 1
        except Exception:
            failures += 1
    return {
        "eligible": len(rows),
        "evidence_purged": deleted,
        "drafts_deleted": drafts_deleted,
        "failures": failures,
    }


def cleanup_forecast_telemetry(limit: int = 1000) -> dict:
    """Enforce the configured prediction-ledger retention in bounded batches."""

    days = max(30, settings.forecast_prediction_retention_days)
    cutoff = datetime.now(UTC) - timedelta(days=days)
    deleted_runs = supabase_client.delete_forecast_runs_before(
        cutoff.isoformat(), limit
    )
    provider_snapshot_days = max(2, settings.forecast_provider_snapshot_retention_days)
    provider_run_days = max(7, settings.forecast_provider_run_retention_days)
    snapshot_cutoff = datetime.now(UTC) - timedelta(days=provider_snapshot_days)
    run_cutoff = datetime.now(UTC) - timedelta(days=provider_run_days)
    deleted_snapshots, deleted_provider_runs = (
        supabase_client.delete_provider_history_before(
            snapshot_cutoff.isoformat(), run_cutoff.isoformat()
        )
    )
    return {
        "retention_days": days,
        "cutoff_at": cutoff.isoformat(),
        "deleted_runs": deleted_runs,
        "batch_limit": limit,
        "more_may_remain": deleted_runs == limit,
        "provider_snapshot_retention_days": provider_snapshot_days,
        "provider_run_retention_days": provider_run_days,
        "deleted_provider_snapshots": deleted_snapshots,
        "deleted_provider_runs": deleted_provider_runs,
    }
