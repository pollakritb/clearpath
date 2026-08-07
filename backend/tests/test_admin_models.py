import pytest
from pydantic import ValidationError

from backend.models.admin import FalseSafeReviewRequest


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
