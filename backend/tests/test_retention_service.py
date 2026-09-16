from __future__ import annotations

from backend.core.config import settings
from backend.services import retention


def test_report_retention_purges_evidence_and_unsubmitted_drafts(monkeypatch):
    deleted_images: list[str] = []
    purged_reports: list[str] = []
    deleted_drafts: list[str] = []
    monkeypatch.setattr(
        retention.supabase_client,
        "list_expired_report_evidence",
        lambda _limit: [
            {"report_id": "report-1", "image_path": "reports/one.jpg"},
            {"report_id": "report-2", "image_path": None},
        ],
    )
    monkeypatch.setattr(
        retention.supabase_client,
        "list_expired_report_drafts",
        lambda _limit: [
            {"id": "draft-1", "image_path": "drafts/one.jpg", "submitted_at": None},
            {
                "id": "draft-2",
                "image_path": "drafts/two.jpg",
                "submitted_at": "2026-09-16T00:00:00Z",
            },
        ],
    )
    monkeypatch.setattr(
        retention.supabase_client, "delete_report_image", deleted_images.append
    )
    monkeypatch.setattr(
        retention.supabase_client, "purge_report_evidence", purged_reports.append
    )
    monkeypatch.setattr(
        retention.supabase_client,
        "delete_expired_report_draft",
        deleted_drafts.append,
    )

    result = retention.cleanup_expired_reports(50)

    assert result == {
        "eligible": 2,
        "evidence_purged": 2,
        "drafts_deleted": 2,
        "failures": 0,
    }
    assert deleted_images == ["reports/one.jpg", "drafts/one.jpg"]
    assert purged_reports == ["report-1", "report-2"]
    assert deleted_drafts == ["draft-1", "draft-2"]


def test_report_retention_keeps_failed_rows_retryable(monkeypatch):
    monkeypatch.setattr(
        retention.supabase_client,
        "list_expired_report_evidence",
        lambda _limit: [{"report_id": "report-1", "image_path": "one.jpg"}],
    )
    monkeypatch.setattr(
        retention.supabase_client,
        "list_expired_report_drafts",
        lambda _limit: [{"id": "draft-1", "image_path": None}],
    )
    monkeypatch.setattr(
        retention.supabase_client,
        "delete_report_image",
        lambda _path: (_ for _ in ()).throw(RuntimeError("storage failed")),
    )
    monkeypatch.setattr(
        retention.supabase_client,
        "purge_report_evidence",
        lambda _id: None,
    )
    monkeypatch.setattr(
        retention.supabase_client,
        "delete_expired_report_draft",
        lambda _id: (_ for _ in ()).throw(RuntimeError("database failed")),
    )

    result = retention.cleanup_expired_reports()
    assert result["evidence_purged"] == 0
    assert result["drafts_deleted"] == 0
    assert result["failures"] == 2


def test_forecast_retention_enforces_minimum_windows_and_batch_signal(monkeypatch):
    monkeypatch.setattr(settings, "forecast_prediction_retention_days", 1)
    monkeypatch.setattr(settings, "forecast_provider_snapshot_retention_days", 1)
    monkeypatch.setattr(settings, "forecast_provider_run_retention_days", 1)
    cutoffs: dict[str, str] = {}
    monkeypatch.setattr(
        retention.supabase_client,
        "delete_forecast_runs_before",
        lambda cutoff, limit: cutoffs.update({"forecast": cutoff}) or limit,
    )
    monkeypatch.setattr(
        retention.supabase_client,
        "delete_provider_history_before",
        lambda snapshot, run: (
            cutoffs.update({"snapshot": snapshot, "run": run}) or (3, 2)
        ),
    )

    result = retention.cleanup_forecast_telemetry(limit=10)
    assert result["retention_days"] == 30
    assert result["provider_snapshot_retention_days"] == 2
    assert result["provider_run_retention_days"] == 7
    assert result["deleted_runs"] == 10
    assert result["more_may_remain"] is True
    assert result["deleted_provider_snapshots"] == 3
    assert result["deleted_provider_runs"] == 2
    assert set(cutoffs) == {"forecast", "snapshot", "run"}
