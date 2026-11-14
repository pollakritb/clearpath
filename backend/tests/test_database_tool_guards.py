import pytest

from backend.core.config import Settings
from scripts.load_readonly_api import local_url
from scripts.production_preflight import optional_tables, required_tables


@pytest.mark.parametrize(
    "url",
    [
        "https://clearpath-gray.vercel.app",
        "http://127.0.0.1.evil.example",
        "http://localhost:8000/api",
        "http://user:secret@localhost",
        "http://localhost?redirect=prod",
        "https://127.0.0.1",
    ],
)
def test_load_harness_rejects_production_and_ambiguous_targets(url):
    with pytest.raises(ValueError):
        local_url(url)


def test_preflight_grid_cutover_does_not_require_retired_storage():
    config = Settings(
        _env_file=None,
        cams_grid_forecast_enabled=True,
        cams_grid_collection_enabled=False,
    )
    assert "forecast_provider_snapshots" not in required_tables(config)
    assert "cams_grid_frames" in optional_tables(config)
    assert local_url("http://127.0.0.1:8000") == "http://127.0.0.1:8000"


def test_load_harness_does_not_count_empty_fixture_as_success(monkeypatch):
    import asyncio

    import httpx

    from scripts import load_readonly_api as load

    original = httpx.AsyncClient
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json={}))
    monkeypatch.setattr(
        load.httpx, "AsyncClient", lambda **kw: original(transport=transport, **kw)
    )
    result = asyncio.run(load.level("http://127.0.0.1:8000", 1, 0.01))
    assert result["requests"] > 0
    assert result["failures"] == result["requests"]
    assert not result["passed"]
