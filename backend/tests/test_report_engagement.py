from datetime import UTC, datetime
from uuid import uuid4

import pytest

from backend.core.config import settings
from backend.services import local_store
from backend.services.community import engagement


def _approved_report(owner_id: str) -> str:
    report_id = str(uuid4())
    local_store.ensure_profile(owner_id, "เจ้าของรายงาน")
    local_store.insert_report(
        {
            "id": report_id,
            "user_id": owner_id,
            "status": "approved",
            "like_count": 0,
            "dislike_count": 0,
            "comment_count": 0,
            "created_at": datetime.now(UTC).isoformat(),
        }
    )
    return report_id


def test_reactions_are_idempotent_switchable_and_separate_from_trust(monkeypatch):
    monkeypatch.setattr(settings, "local_demo_mode", True)
    owner_id = str(uuid4())
    viewer_id = str(uuid4())
    report_id = _approved_report(owner_id)
    local_store.ensure_profile(viewer_id, "ผู้ใช้งาน")

    liked = engagement.set_reaction(report_id, viewer_id, "like")
    assert liked["like_count"] == 1
    assert liked["dislike_count"] == 0
    assert liked["viewer_reaction"] == "like"

    disliked = engagement.set_reaction(report_id, viewer_id, "dislike")
    assert disliked["like_count"] == 0
    assert disliked["dislike_count"] == 1
    assert disliked["viewer_reaction"] == "dislike"

    cleared = engagement.clear_reaction(report_id, viewer_id)
    assert cleared["like_count"] == 0
    assert cleared["dislike_count"] == 0
    assert cleared["viewer_reaction"] is None
    assert "trust_score" not in local_store.get_report(report_id)

    with pytest.raises(ValueError, match="ตนเอง"):
        engagement.set_reaction(report_id, owner_id, "like")


def test_comment_lifecycle_tracks_public_count_and_owner(monkeypatch):
    monkeypatch.setattr(settings, "local_demo_mode", True)
    owner_id = str(uuid4())
    commenter_id = str(uuid4())
    report_id = _approved_report(owner_id)
    local_store.ensure_profile(commenter_id, "ผู้แสดงความคิดเห็น")

    comment = engagement.add_comment(report_id, commenter_id, "  ข้อมูลนี้ช่วยตัดสินใจได้  ")
    assert comment["body"] == "ข้อมูลนี้ช่วยตัดสินใจได้"
    assert comment["is_own"] is True

    summary = engagement.get_engagement(report_id, commenter_id)
    assert summary["comment_count"] == 1
    assert summary["comments"][0]["display_name"] == "ผู้แสดงความคิดเห็น"
    assert summary["comments"][0]["is_own"] is True

    assert engagement.remove_comment(comment["id"], owner_id) is False
    assert engagement.remove_comment(comment["id"], commenter_id) is True
    assert engagement.get_engagement(report_id)["comment_count"] == 0
