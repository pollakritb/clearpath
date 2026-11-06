from __future__ import annotations

from backend.services import retention


def test_report_retention_purges_evidence_and_unsubmitted_drafts(monkeypatch):
    deleted_images: list[str] = []
    purged_reports: list[str] = []
    deleted_drafts: list[str] = []
    monkeypatch.setattr(
        retention.supabase_client,
        "list_expired_report_evidence",
        lambda _limit: [
            {
                "report_id": "report-1",
                "image_path": "reports/one.jpg",
                "original_image_path": "originals/one.jpg",
            },
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
    assert deleted_images == ["originals/one.jpg", "reports/one.jpg", "drafts/one.jpg"]
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
