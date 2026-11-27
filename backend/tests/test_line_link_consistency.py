from datetime import UTC, datetime

import pytest

from backend.core.config import settings
from backend.services import line_messaging, local_store


@pytest.fixture
def isolated(monkeypatch):
    monkeypatch.setattr(settings, "local_demo_mode", True)
    monkeypatch.setattr(settings, "line_messaging_enabled", True)
    monkeypatch.setattr(settings, "line_channel_secret", "test-secret")
    monkeypatch.setattr(settings, "line_channel_access_token", "test-token")
    monkeypatch.setattr(local_store, "_LINE_NOTIFICATION_LINKS", {})
    monkeypatch.setattr(local_store, "_NOTIFICATION_OUTBOX", {})
    monkeypatch.setattr(local_store, "_NOTIFICATION_PREFERENCES", {})


def test_code_issuance_preserves_existing_link_and_reset_revokes_code(isolated):
    uid = "U" + "1" * 32
    local_store.upsert_line_notification_link(
        "owner",
        {
            "active": True,
            "line_user_id": uid,
            "linked_at": datetime.now(UTC).isoformat(),
        },
    )
    code = line_messaging.create_link_code("owner")
    assert line_messaging.status("owner")["linked"] is True
    assert line_messaging.disconnect("owner") is True
    assert local_store.get_line_notification_link("owner") is None
    assert line_messaging.status("owner")["linked"] is False
    assert not line_messaging._link(code["code"], uid)
    new = line_messaging.create_link_code("owner")
    assert line_messaging._link(new["code"], uid)
    assert line_messaging.status("owner")["linked"] is True


def test_reset_cancels_pending_delivery_without_deleting_history(isolated):
    local_store.upsert_line_notification_link(
        "owner", {"active": False, "line_user_id": "U" + "1" * 32}
    )
    local_store._NOTIFICATION_OUTBOX.update(
        {
            "pending": {
                "user_id": "owner",
                "status": "pending",
                "payload": {"channel": "line"},
            },
            "sent": {
                "user_id": "owner",
                "status": "sent",
                "payload": {"channel": "line"},
            },
        }
    )
    line_messaging.disconnect("owner")
    assert local_store._NOTIFICATION_OUTBOX["pending"]["status"] == "dead"
    assert local_store._NOTIFICATION_OUTBOX["sent"]["status"] == "sent"
    assert local_store.get_notification_preferences("owner")["line_enabled"] is False
    assert line_messaging.disconnect("owner") is False


def test_status_is_not_cacheable_and_delete_is_owner_scoped(isolated):
    from fastapi.testclient import TestClient

    from backend.core.auth import AuthenticatedUser, require_user
    from backend.main import create_app

    local_store.upsert_line_notification_link(
        "other", {"active": True, "line_user_id": "U" + "2" * 32}
    )
    local_store.upsert_line_notification_link(
        "owner", {"active": True, "line_user_id": "U" + "1" * 32}
    )
    app = create_app()
    app.dependency_overrides[require_user] = lambda: AuthenticatedUser(
        "owner", None, "user"
    )
    client = TestClient(app)
    assert (
        client.get("/api/notifications/line").headers["cache-control"]
        == "private, no-store"
    )
    assert client.delete("/api/notifications/line").status_code == 200
    assert local_store.get_line_notification_link("owner") is None
    assert local_store.get_line_notification_link("other")["active"] is True
