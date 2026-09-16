import pytest
from pydantic import ValidationError

from backend.models.admin import DataIssueUpdateRequest, FalseSafeReviewRequest


def test_false_safe_review_requires_supported_disposition_and_substantive_note():
    review = FalseSafeReviewRequest(
        disposition="safety_incident",
        note="พบผลกระทบต่อการสื่อสารความเสี่ยงของผู้ใช้",
    )
    assert review.disposition == "safety_incident"

    with pytest.raises(ValidationError):
        FalseSafeReviewRequest(disposition="unknown", note="รายละเอียดเพียงพอ")
    with pytest.raises(ValidationError):
        FalseSafeReviewRequest(disposition="model_issue", note="สั้น")


def test_data_issue_update_requires_reason_and_current_version():
    request = DataIssueUpdateRequest(
        status="resolved",
        reason="ตรวจสอบสถานีต้นทางและแก้ข้อมูลแล้ว",
        expected_updated_at="2026-09-16T00:00:00+00:00",
    )
    assert request.status == "resolved"

    with pytest.raises(ValidationError):
        DataIssueUpdateRequest(
            status="new",
            reason="รายละเอียดเพียงพอ",
            expected_updated_at="2026-09-16T00:00:00+00:00",
        )
    with pytest.raises(ValidationError):
        DataIssueUpdateRequest(
            status="dismissed", reason="สั้น", expected_updated_at="old"
        )
