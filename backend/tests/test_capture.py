import pytest

from backend.services import capture


def test_signed_camera_session_round_trip(monkeypatch):
    monkeypatch.setattr(capture.settings, "capture_session_secret", "test-secret")
    monkeypatch.setattr(capture.settings, "capture_session_ttl_seconds", 300)
    monkeypatch.setattr(
        capture.supabase_client, "create_capture_session", lambda row: row
    )
    monkeypatch.setattr(
        capture.supabase_client,
        "get_capture_session",
        lambda _sid: {"user_id": "user-1", "consumed_at": None},
    )
    issued = capture.issue_session("user-1", now=1_700_000_000)
    verified = capture.verify_session(issued["token"], "user-1", now=1_700_000_120)
    assert verified["session_id"] == issued["session_id"]
    assert verified["age_seconds"] == 120


def test_expired_or_tampered_camera_session_is_rejected(monkeypatch):
    monkeypatch.setattr(capture.settings, "capture_session_secret", "test-secret")
    monkeypatch.setattr(capture.settings, "capture_session_ttl_seconds", 300)
    monkeypatch.setattr(
        capture.supabase_client, "create_capture_session", lambda row: row
    )
    monkeypatch.setattr(
        capture.supabase_client,
        "get_capture_session",
        lambda _sid: {"user_id": "user-1", "consumed_at": None},
    )
    issued = capture.issue_session("user-1", now=1_700_000_000)
    with pytest.raises(ValueError, match="เกินเวลา"):
        capture.verify_session(issued["token"], "user-1", now=1_700_000_301)
    with pytest.raises(ValueError, match="ไม่ถูกต้อง"):
        capture.verify_session(issued["token"] + "x", "user-1", now=1_700_000_100)


def test_capture_session_is_bound_and_consumed_once(monkeypatch):
    monkeypatch.setattr(capture.settings, "capture_session_secret", "test-secret")
    monkeypatch.setattr(
        capture.supabase_client, "create_capture_session", lambda row: row
    )
    monkeypatch.setattr(
        capture.supabase_client,
        "get_capture_session",
        lambda _sid: {"user_id": "user-1", "consumed_at": None},
    )
    issued = capture.issue_session("user-1", now=1_700_000_000)
    with pytest.raises(ValueError, match="บัญชีนี้"):
        capture.verify_session(issued["token"], "user-2", now=1_700_000_010)
    calls = iter([True, False])
    monkeypatch.setattr(
        capture.supabase_client, "consume_capture_session", lambda *_args: next(calls)
    )
    capture.consume_session(issued["session_id"], "user-1")
    with pytest.raises(ValueError, match="ถูกใช้แล้ว"):
        capture.consume_session(issued["session_id"], "user-1")
