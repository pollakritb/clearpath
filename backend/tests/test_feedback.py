import pytest

from backend.services.community.feedback import (
    create_data_issue,
    validate_feedback_text,
)


@pytest.mark.parametrize(
    "message",
    [
        "ติดต่อฉันที่ person@example.com เพราะค่าผิด",
        "รายละเอียดอยู่ที่ https://example.com/private",
        "ค่าผิดตรงพิกัด 13.812345,100.123456 กรุณาตรวจ",
    ],
)
def test_feedback_rejects_contact_links_and_precise_coordinates(message):
    with pytest.raises(ValueError):
        validate_feedback_text(message)


def test_feedback_persists_only_minimized_private_issue(monkeypatch):
    captured = {}
    monkeypatch.setattr(
        "backend.services.community.feedback.supabase_client.create_data_issue",
        lambda row: captured.update(row) or row,
    )
    result = create_data_issue(
        "user-1",
        {
            "category": "station",
            "reference_id": "81t",
            "message": "  ค่าของสถานีนี้ต่างจากเวลาที่แสดง   มากเกินไป  ",
        },
    )
    assert result["user_id"] == "user-1"
    assert result["message"] == "ค่าของสถานีนี้ต่างจากเวลาที่แสดง มากเกินไป"
    assert "lat" not in result
    assert "image" not in result
