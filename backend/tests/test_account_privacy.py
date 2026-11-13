from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from backend.algorithms.authentication_time import authentication_time
from backend.core.auth import AuthenticatedUser, require_user
from backend.core.config import settings
from backend.main import create_app
from backend.services import account_privacy, local_store


def test_refresh_is_not_fresh_authentication():
    now = datetime.now(UTC)
    claims = {
        "iat": now.timestamp(),
        "amr": [
            {"method": "token_refresh", "timestamp": now.timestamp()},
            {"method": "oauth", "timestamp": (now - timedelta(days=1)).timestamp()},
        ],
    }
    assert authentication_time(claims, now=now) == (now - timedelta(days=1)).isoformat()
    assert authentication_time({"iat": now.timestamp()}, now=now) is None
    assert (
        authentication_time(
            {"amr": [{"method": "oauth", "timestamp": float("nan")}]}, now=now
        )
        is None
    )


@pytest.fixture
def privacy_client(monkeypatch):
    monkeypatch.setattr(settings, "local_demo_mode", True)
    monkeypatch.setattr(account_privacy, "DEMO_REQUESTS", {})
    app = create_app()
    subject = [
        AuthenticatedUser(
            id="owner",
            email=None,
            role="user",
            authenticated_at=datetime.now(UTC).isoformat(),
        )
    ]
    app.dependency_overrides[require_user] = lambda: subject[0]
    with TestClient(app) as client:
        yield client, subject


def test_export_filters_subject_columns_and_never_exports_secrets(
    privacy_client, monkeypatch
):
    client, _ = privacy_client
    monkeypatch.setattr(
        local_store,
        "_REPORTS",
        {
            "mine": {
                "id": "mine",
                "user_id": "owner",
                "created_at": "2026-01-01",
                "pm25": 10,
                "image_path": "private/image.jpg",
                "ocr_raw_text": "private-audit",
                "lat": 13.8,
                "lon": 100,
            },
            "other": {
                "id": "other",
                "user_id": "another-user",
                "created_at": "2026-01-01",
                "pm25": 99,
            },
        },
    )
    response = client.get(
        "/api/community/me/data-export", params={"section": "reports"}
    )
    assert (
        response.status_code == 200 and response.headers["cache-control"] == "no-store"
    )
    rows = response.json()["items"]
    assert len(rows) == 1 and rows[0]["id"] == "mine"
    assert (
        "image_path" not in rows[0]
        and "ocr_raw_text" not in rows[0]
        and "user_id" not in rows[0]
    )
    assert (
        client.get(
            "/api/community/me/data-export", params={"section": "profiles; drop table"}
        ).status_code
        == 422
    )


def test_old_login_cannot_export_or_request_deletion(privacy_client):
    client, subject = privacy_client
    subject[0] = AuthenticatedUser(
        id="owner",
        email=None,
        role="user",
        authenticated_at=(datetime.now(UTC) - timedelta(minutes=10)).isoformat(),
    )
    assert (
        client.get("/api/community/me/data-export?section=reports").status_code == 403
    )
    assert (
        client.post(
            "/api/community/me/deletion-request",
            json={"confirmation": "ลบบัญชี", "acknowledges_retention": True},
        ).status_code
        == 403
    )


def test_demo_deletion_simulates_completion_without_mutating_hosted_data(
    privacy_client,
):
    client, subject = privacy_client
    payload = {"confirmation": "ลบบัญชี", "acknowledges_retention": True}
    first = client.post("/api/community/me/deletion-request", json=payload)
    assert first.status_code == 202 and first.json()["status"] == "completed"
    assert "user_id" not in first.json()
    assert (
        client.post("/api/community/me/deletion-request", json=payload).json()["id"]
        == first.json()["id"]
    )
    status = client.get("/api/community/me/privacy").json()
    assert status["automatic_deletion"] and len(status["requests"]) == 1
    subject[0] = AuthenticatedUser(
        id="other-user",
        email=None,
        role="user",
        authenticated_at=datetime.now(UTC).isoformat(),
    )
    assert client.get("/api/community/me/privacy").json()["requests"] == []


def test_body_cannot_override_owner_or_skip_confirmation(privacy_client):
    client, _ = privacy_client
    assert (
        client.post(
            "/api/community/me/deletion-request",
            json={
                "confirmation": "ลบบัญชี",
                "acknowledges_retention": True,
                "user_id": "other-user",
            },
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/community/me/deletion-request",
            json={"confirmation": "yes", "acknowledges_retention": True},
        ).status_code
        == 422
    )


def test_privacy_routes_require_real_auth_outside_demo(monkeypatch):
    monkeypatch.setattr(settings, "local_demo_mode", False)
    with TestClient(create_app()) as client:
        assert client.get("/api/community/me/privacy").status_code == 401
        assert (
            client.get("/api/community/me/data-export?section=reports").status_code
            == 401
        )
