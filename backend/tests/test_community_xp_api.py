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


def test_dashboard_cannot_reverse_xp(client):
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
    assert c.post(path, json={"reason": "confirmed manipulation"}).status_code == 404
    assert c.get("/api/community/xp/admin").status_code == 403
    app.dependency_overrides[require_user] = lambda: AuthenticatedUser(
        id="admin", email=None, role="admin"
    )
    assert c.post(path, json={"reason": "confirmed manipulation"}).status_code == 404
    assert c.post(path, json={"reason": "confirmed manipulation"}).status_code == 404
    assert xp.summary("owner")["lifetime_xp"] == 10
    assert len(c.get("/api/community/xp/admin").json()["events"]) == 1


def test_profile_overview_does_not_depend_on_optional_trust_or_evidence(
    client, monkeypatch
):
    from backend.core.errors import UpstreamError
    from backend.services.community import community_trust, policy_v2, policy_v3

    c, _ = client
    monkeypatch.setattr(
        policy_v2,
        "release",
        lambda: {"active_version": "v2", "launched_at": "2026-11-01T00:00:00Z"},
    )
    monkeypatch.setattr(policy_v3, "release", lambda: {})
    monkeypatch.setattr(policy_v3, "applies", lambda **kwargs: False)
    calls = []
    monkeypatch.setattr(
        policy_v2, "counters", lambda uid: calls.append(uid) or {"month_points": 35}
    )

    def unavailable(*args, **kwargs):
        raise UpstreamError("optional details unavailable")

    monkeypatch.setattr(policy_v2, "outcomes", unavailable)
    monkeypatch.setattr(community_trust, "summary", unavailable)
    response = c.get("/api/community/me/xp?details=false")
    assert response.status_code == 200
    assert response.json()["month_points"] == 35
    assert response.json()["community_trust"] is None
    assert response.json()["evidence_history"] is None
    assert calls == ["owner"]
    saved = c.put(
        "/api/community/me/xp?details=false",
        json={"alias": "สายลม", "hidden": True},
    )
    assert saved.status_code == 200
    assert saved.json()["alias"] == "สายลม"
    assert saved.json()["hidden"] is True
    # Full summary clients still receive an explicit failure for unavailable details.
    assert c.get("/api/community/me/xp").status_code == 502


def test_owned_reports_load_independently_of_scores(client, monkeypatch):
    from backend.services import supabase_client

    c, _ = client

    def unwanted(*args, **kwargs):
        pytest.fail("Owned reports must not load unrelated account or score data")

    monkeypatch.setattr(xp, "summary", unwanted)
    monkeypatch.setattr(supabase_client, "get_profile", unwanted)
    monkeypatch.setattr(supabase_client, "get_user_weekly_points", unwanted)
    monkeypatch.setattr(
        supabase_client,
        "list_user_reports",
        lambda uid, limit: [] if uid == "owner" else unwanted(),
    )
    response = c.get("/api/community/me/reports")
    assert response.status_code == 200
    assert response.json()["reports"] == []
    assert response.json()["count"] == 0
