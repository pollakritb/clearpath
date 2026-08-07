import pytest
from fastapi import HTTPException

from backend.core import auth


def test_missing_bearer_is_rejected_outside_local_demo(monkeypatch):
    monkeypatch.setattr(auth.settings, "local_demo_mode", False)
    with pytest.raises(HTTPException) as exc:
        auth.require_user(None)
    assert exc.value.status_code == 401


def test_local_demo_identity_is_server_generated(monkeypatch):
    monkeypatch.setattr(auth.settings, "local_demo_mode", True)
    user = auth.require_user(None)
    assert user.role == "admin"
    assert user.id == "00000000-0000-0000-0000-000000000001"


def test_verified_token_uses_server_side_profile_role(monkeypatch):
    monkeypatch.setattr(auth.settings, "local_demo_mode", False)
    monkeypatch.setattr(
        auth.supabase_client,
        "get_auth_user",
        lambda token: {
            "id": "verified-user",
            "email": "user@example.test",
            "user_metadata": {"display_name": "Browser Name"},
        },
    )
    monkeypatch.setattr(
        auth.supabase_client,
        "ensure_profile",
        lambda user_id, display_name: {
            "id": user_id,
            "display_name": display_name,
            "role": "moderator",
        },
    )
    user = auth.require_user("Bearer verified-token")
    assert user.id == "verified-user"
    assert user.role == "moderator"
    assert user.display_name == "Browser Name"


def test_invalid_supabase_token_is_rejected(monkeypatch):
    monkeypatch.setattr(auth.settings, "local_demo_mode", False)

    def fail(_token):
        raise ValueError("invalid")

    monkeypatch.setattr(auth.supabase_client, "get_auth_user", fail)
    with pytest.raises(HTTPException) as exc:
        auth.require_user("Bearer invalid-token")
    assert exc.value.status_code == 401


def test_role_guards_fail_closed():
    user = auth.AuthenticatedUser("user-1", None, "user")
    moderator = auth.AuthenticatedUser("mod-1", None, "moderator")
    admin = auth.AuthenticatedUser("admin-1", None, "admin")

    with pytest.raises(HTTPException) as moderator_error:
        auth.require_moderator(user)
    assert moderator_error.value.status_code == 403
    assert auth.require_moderator(moderator) == moderator

    with pytest.raises(HTTPException) as admin_error:
        auth.require_admin(moderator)
    assert admin_error.value.status_code == 403
    assert auth.require_admin(admin) == admin
