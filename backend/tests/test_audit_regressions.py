"""Offline regressions for the whole-platform audit; no production services."""

import asyncio
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from backend.core.auth import require_user
from backend.core.config import settings
from backend.core.errors import ReportInProgressError
from backend.main import create_app
from backend.routers import history, notifications
from backend.services import local_store, store_stations
from backend.services.community import drafts, evidence


def test_history_api_uses_selected_end_and_limits_future(monkeypatch):
    calls = []
    monkeypatch.setattr(
        history.supabase_client, "get_history", lambda *args: calls.append(args) or []
    )
    with TestClient(create_app()) as client:
        end = datetime.now(UTC) - timedelta(hours=12)
        assert (
            client.get(
                "/api/history",
                params={"station_id": "A", "hours": 24, "end_at": end.isoformat()},
            ).status_code
            == 200
        )
        assert calls[-1] == ("A", 24, end)
        now = datetime.now(UTC)
        assert (
            client.get(
                "/api/history",
                params={
                    "station_id": "A",
                    "end_at": (now + timedelta(days=1)).isoformat(),
                },
            ).status_code
            == 200
        )
        assert calls[-1][2] < now + timedelta(seconds=5)
        assert (
            client.get(
                "/api/history", params={"station_id": "A", "end_at": "invalid"}
            ).status_code
            == 422
        )


def test_history_store_queries_both_window_boundaries(monkeypatch):
    calls = []

    class Query:
        def __getattr__(self, name):
            def call(*args):
                calls.append((name, args))
                return SimpleNamespace(data=[]) if name == "execute" else self

            return call

    monkeypatch.setattr(settings, "local_demo_mode", False)
    monkeypatch.setattr(store_stations.db, "get_client", lambda: Query())
    end = datetime(2026, 11, 11, 12, tzinfo=UTC)
    store_stations.get_history("A", 24, end)
    assert ("gte", ("recorded_at", (end - timedelta(hours=24)).isoformat())) in calls
    assert ("lte", ("recorded_at", end.isoformat())) in calls


def test_historical_window_keeps_all_24_seeded_hours_and_excludes_future(monkeypatch):
    end = datetime(2026, 11, 11, 12, tzinfo=UTC)
    monkeypatch.setattr(
        local_store,
        "_HISTORY",
        [
            {
                "station_id": "A",
                "recorded_at": (end - timedelta(hours=i)).isoformat(),
                "pm25": i,
            }
            for i in range(-12, 25)
        ],
    )
    points = local_store.get_history("A", 24, end)
    assert len(points) == 25  # inclusive endpoints; the UI shows 24 hourly slots
    assert all(
        end - timedelta(hours=24) <= datetime.fromisoformat(p["recorded_at"]) <= end
        for p in points
    )


def test_pending_retry_waits_for_terminal_status_without_finalizing_again(monkeypatch):
    async def sleep(_seconds):
        return None

    monkeypatch.setattr(asyncio, "sleep", sleep)
    monkeypatch.setattr(
        drafts.supabase_client,
        "get_community_report",
        lambda _id: {"id": "A", "status": "approved"},
    )
    monkeypatch.setattr(
        drafts, "present_report", lambda report, **_kwargs: dict(report)
    )
    result = asyncio.run(drafts._completed_retry({"id": "A", "status": "pending"}, []))
    assert result["status"] == "approved"
    assert result["_review_outcome"] == "automatic_approved"


def test_pending_retry_times_out_as_retryable_instead_of_false_rejection(monkeypatch):
    async def sleep(_seconds):
        return None

    monkeypatch.setattr(asyncio, "sleep", sleep)
    monkeypatch.setattr(
        drafts.supabase_client,
        "get_community_report",
        lambda _id: {"id": "A", "status": "pending"},
    )
    with pytest.raises(ReportInProgressError):
        asyncio.run(drafts._completed_retry({"id": "A", "status": "pending"}, []))


def test_line_test_endpoints_share_cooldown_without_sending_real_messages(monkeypatch):
    monkeypatch.setattr(settings, "local_demo_mode", True)
    user = SimpleNamespace(id="audit-test-user")
    calls = []
    slots = set()
    monkeypatch.setattr(
        notifications.line_messaging, "status", lambda _id: {"linked": True}
    )

    def rate(user_id, action, _window, _limit):
        key = (user_id, action)
        if key in slots:
            return False
        slots.add(key)
        return True

    monkeypatch.setattr(notifications.supabase_client, "take_rate_limit", rate)
    monkeypatch.setattr(
        notifications.notification_service,
        "deliver_to_user",
        lambda *args, **kwargs: calls.append("generic") or 1,
    )
    monkeypatch.setattr(
        notifications.line_messaging,
        "send_test_to_user",
        lambda _id: calls.append("line") or True,
    )
    app = create_app()
    app.dependency_overrides[require_user] = lambda: user
    with TestClient(app) as client:
        assert client.post("/api/notifications/test").status_code == 200
        limited = client.post("/api/notifications/line/test")
        assert limited.status_code == 429
        assert limited.headers["Retry-After"] == "60"
        assert calls == ["generic"]
        user.id = "another-account"
        assert client.post("/api/notifications/line/test").status_code == 200
        assert calls == ["generic", "line"]


def test_line_test_daily_limit_has_retry_after(monkeypatch):
    monkeypatch.setattr(
        notifications.line_messaging, "status", lambda _id: {"linked": True}
    )
    monkeypatch.setattr(
        notifications.supabase_client,
        "take_rate_limit",
        lambda _id, _action, window, _limit: window == 60,
    )
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as caught:
        asyncio.run(
            notifications.require_notification_test_slot(SimpleNamespace(id="account"))
        )
    assert caught.value.status_code == 429
    assert caught.value.headers["Retry-After"] == "86400"


def test_multipart_is_rejected_before_file_processing(monkeypatch):
    monkeypatch.setattr(settings, "local_demo_mode", True)
    with TestClient(create_app()) as client:
        response = client.post(
            "/api/community/image-metadata",
            content=b"",
            headers={
                "Content-Type": "multipart/form-data; boundary=x",
                "Content-Length": str(evidence.MAX_MULTIPART_BYTES + 1),
            },
        )
    assert response.status_code == 413
    assert "4 MB" in response.json()["detail"]


def test_image_uniqueness_race_returns_duplicate_validation_not_raw_db_error(
    monkeypatch,
):
    from postgrest.exceptions import APIError

    from backend.services import store_community

    class Query:
        def table(self, *_args):
            return self

        def upsert(self, *_args, **_kwargs):
            return self

        def execute(self):
            raise APIError(
                {
                    "code": "23505",
                    "message": 'duplicate key violates unique constraint "community_reports_image_sha256_key"',
                    "details": "image_sha256 already exists",
                    "hint": None,
                }
            )

    monkeypatch.setattr(settings, "local_demo_mode", False)
    monkeypatch.setattr(store_community.db, "get_client", lambda: Query())
    with pytest.raises(ValueError, match="ภาพนี้เคยส่งรายงานแล้ว"):
        store_community.insert_community_report_once(
            {"id": "other-report", "image_sha256": "same"}
        )
