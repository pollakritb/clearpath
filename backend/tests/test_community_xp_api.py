from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.core.auth import AuthenticatedUser, require_user
from backend.core.config import settings
from backend.main import create_app
from backend.services.community import xp


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(settings, "local_demo_mode", True)
    xp._ACCOUNTS.clear()
    xp._EVENTS.clear()
    xp._CLAIMS.clear()
    app = create_app()
    app.dependency_overrides[require_user] = lambda: AuthenticatedUser(
        id="owner", email=None, role="user"
    )
    with TestClient(app) as c:
        yield c, app
    xp._ACCOUNTS.clear()
    xp._EVENTS.clear()
    xp._CLAIMS.clear()


def test_private_settings_and_public_member_contract(client):
    c, app = client
    s = c.get("/api/community/me/xp").json()
    assert s["lifetime_xp"] == 0 and s["alias"].startswith("สมาชิก CP-")
    assert (
        c.put(
            "/api/community/me/xp", json={"alias": "อากาศสดใส", "hidden": False}
        ).status_code
        == 200
    )
    public = c.get(f"/api/community/members/{s['member_id']}")
    assert public.json()["alias"] == "อากาศสดใส"
    assert "user_id" not in public.json()
    assert c.get("/api/community/leaderboard?period=season").status_code == 422
    assert c.get("/api/community/leaderboard?offset=-1").status_code == 422
    assert (
        c.put(
            "/api/community/me/xp", json={"alias": "<script>", "hidden": False}
        ).status_code
        == 422
    )
    c.put("/api/community/me/xp", json={"alias": "อากาศสดใส", "hidden": True})
    assert c.get(f"/api/community/members/{s['member_id']}").status_code == 404
    assert (
        c.get("/api/community/me/leaderboard?period=30d").json()["me"]["rank"] is None
    )
    assert c.get("/api/community/me/xp-events").json()["events"] == []


def test_reversal_is_admin_only_and_idempotent(client):
    c, app = client
    event_id = str(uuid4())
    xp.account("owner")
    xp._EVENTS.append(
        dict(
            id=event_id,
            user_id="owner",
            kind="report",
            points=10,
            reason="granted",
            occurred_at="2026-10-30T12:00:00Z",
            recorded_at="2026-10-30T12:00:00Z",
            policy_version="xp-v1",
            report_id=str(uuid4()),
        )
    )
    path = f"/api/community/xp/events/{event_id}/reverse"
    assert c.post(path, json={"reason": "confirmed manipulation"}).status_code == 403
    assert c.get("/api/community/xp/admin").status_code == 403
    app.dependency_overrides[require_user] = lambda: AuthenticatedUser(
        id="admin", email=None, role="admin"
    )
    assert c.post(path, json={"reason": "confirmed manipulation"}).status_code == 204
    assert c.post(path, json={"reason": "confirmed manipulation"}).status_code == 204
    assert xp.summary("owner")["lifetime_xp"] == 0
    assert c.get("/api/community/xp/admin").json()["events"][1]["reversed"] is True
