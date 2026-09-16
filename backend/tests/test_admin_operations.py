from __future__ import annotations

import pytest

from backend.services import admin_operations


def test_data_issue_transition_records_before_after_actor_and_reason(monkeypatch):
    current = {
        "id": "issue-1",
        "status": "new",
        "updated_at": "2026-09-16T00:00:00+00:00",
    }
    audits: list[dict] = []
    monkeypatch.setattr(
        admin_operations.supabase_client,
        "get_data_issue",
        lambda _issue_id: current,
    )
    monkeypatch.setattr(
        admin_operations.supabase_client,
        "update_data_issue_if_current",
        lambda issue_id, expected, values: (
            {**current, **values}
            if issue_id == "issue-1" and expected == current["updated_at"]
            else None
        ),
    )
    monkeypatch.setattr(
        admin_operations.supabase_client,
        "create_audit_log",
        lambda row: audits.append(row) or row,
    )

    result = admin_operations.transition_data_issue(
        issue_id="issue-1",
        status="reviewing",
        reason="ตรวจสอบกับข้อมูลสถานีต้นทางแล้ว",
        expected_updated_at=current["updated_at"],
        actor_id="moderator-1",
    )

    assert result["status"] == "reviewing"
    assert audits == [
        {
            "actor_id": "moderator-1",
            "action": "data_issue_transitioned",
            "entity_type": "data_issue_report",
            "entity_id": "issue-1",
            "details": {
                "before": {"status": "new"},
                "after": {"status": "reviewing"},
                "reason": "ตรวจสอบกับข้อมูลสถานีต้นทางแล้ว",
            },
        }
    ]


def test_data_issue_transition_rejects_stale_and_terminal_records(monkeypatch):
    monkeypatch.setattr(
        admin_operations.supabase_client,
        "get_data_issue",
        lambda _issue_id: {
            "id": "issue-1",
            "status": "resolved",
            "updated_at": "newer",
        },
    )
    with pytest.raises(admin_operations.StaleRecordError):
        admin_operations.transition_data_issue(
            issue_id="issue-1",
            status="dismissed",
            reason="มีผู้ดูแลคนอื่นบันทึกผลแล้ว",
            expected_updated_at="older",
            actor_id="moderator-1",
        )
    with pytest.raises(ValueError, match="transition_not_allowed"):
        admin_operations.transition_data_issue(
            issue_id="issue-1",
            status="dismissed",
            reason="ตรวจพบว่าเคสนี้ปิดเรียบร้อยแล้ว",
            expected_updated_at="newer",
            actor_id="moderator-1",
        )
