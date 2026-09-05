import asyncio
from datetime import UTC, datetime, timedelta

from backend.services import provider_sync


def test_openweather_due_wrapper_skips_recent_success(monkeypatch):
    now = datetime.now(UTC)
    called = False

    async def fake_sync():
        nonlocal called
        called = True
        return {"ok": True, "status": "success"}

    monkeypatch.setattr(provider_sync.settings, "openweather_air_enabled", True)
    monkeypatch.setattr(
        provider_sync.supabase_client,
        "get_latest_provider_sync_run",
        lambda provider: {
            "provider": provider,
            "status": "success",
            "completed_at": (now - timedelta(hours=1)).isoformat(),
        },
    )
    monkeypatch.setattr(provider_sync, "sync_openweather", fake_sync)

    result = asyncio.run(provider_sync.sync_openweather_if_due())

    assert result["status"] == "not_due"
    assert result["interval_hours"] == 8
    assert not called


def test_openmeteo_due_wrapper_runs_after_interval(monkeypatch):
    now = datetime.now(UTC)
    called = False

    async def fake_sync():
        nonlocal called
        called = True
        return {"ok": True, "provider": "openmeteo_cams", "status": "success"}

    monkeypatch.setattr(provider_sync.settings, "openmeteo_air_enabled", True)
    monkeypatch.setattr(
        provider_sync.supabase_client,
        "get_latest_provider_sync_run",
        lambda provider: {
            "provider": provider,
            "status": "success",
            "completed_at": (now - timedelta(hours=13)).isoformat(),
        },
    )
    monkeypatch.setattr(provider_sync, "sync_openmeteo", fake_sync)

    result = asyncio.run(provider_sync.sync_openmeteo_if_due())

    assert result["status"] == "success"
    assert called


def test_disabled_provider_does_not_read_database(monkeypatch):
    def unexpected_read(_provider):
        raise AssertionError("disabled provider must not read sync history")

    monkeypatch.setattr(provider_sync.settings, "openweather_air_enabled", False)
    monkeypatch.setattr(
        provider_sync.supabase_client,
        "get_latest_provider_sync_run",
        unexpected_read,
    )

    result = asyncio.run(provider_sync.sync_openweather_if_due())

    assert result == {
        "ok": True,
        "provider": "openweather",
        "status": "disabled",
    }
