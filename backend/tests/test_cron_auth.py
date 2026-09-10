import pytest
from fastapi import HTTPException

from backend.core.config import settings
from backend.core.errors import ConfigurationError
from backend.routers.cron import _verify_cron


@pytest.fixture(autouse=True)
def restore_cron_settings(monkeypatch):
    monkeypatch.setattr(settings, "local_demo_mode", False)
    monkeypatch.setattr(settings, "cron_secret", "github-token")
    monkeypatch.setattr(settings, "supabase_cron_secret", "supabase-token")


@pytest.mark.parametrize("token", ["github-token", "supabase-token"])
def test_verify_cron_accepts_each_independent_scheduler_token(token):
    _verify_cron(f"Bearer {token}")


@pytest.mark.parametrize(
    "authorization", [None, "", "Basic supabase-token", "Bearer wrong-token"]
)
def test_verify_cron_rejects_missing_or_unknown_token(authorization):
    with pytest.raises(HTTPException) as exc_info:
        _verify_cron(authorization)

    assert exc_info.value.status_code == 401


def test_verify_cron_fails_closed_without_production_token(monkeypatch):
    monkeypatch.setattr(settings, "cron_secret", "")
    monkeypatch.setattr(settings, "supabase_cron_secret", "")

    with pytest.raises(ConfigurationError):
        _verify_cron(None)


def test_verify_cron_allows_unconfigured_local_demo(monkeypatch):
    monkeypatch.setattr(settings, "local_demo_mode", True)
    monkeypatch.setattr(settings, "cron_secret", "")
    monkeypatch.setattr(settings, "supabase_cron_secret", "")

    _verify_cron(None)
