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
