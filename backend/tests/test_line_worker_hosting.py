"""No-send hosting probe and daemon shutdown/readiness contracts."""

from pathlib import Path
from types import SimpleNamespace

import httpx

from backend.core.config import settings
from backend.workers import line


def test_worker_image_dependencies_match_canonical_requirements():
    root = Path(__file__).resolve().parents[2]
    assert (root / "requirements.txt").read_text() == (
        root / "backend/worker-requirements.txt"
    ).read_text()


def test_read_only_probe_never_claims_or_sends(monkeypatch):
    calls = []

    class Database:
        def rpc(self, name):
            calls.append(name)
            assert name == "line_delivery_metrics"
            return SimpleNamespace(
                execute=lambda: SimpleNamespace(
                    data={"pending": 2, "webhook_pending": 1}
                )
            )

    monkeypatch.setattr(line.store_client, "get_client", lambda: Database())
    monkeypatch.setattr(settings, "line_channel_access_token", "")
    monkeypatch.setattr(
        line.line_delivery,
        "process_outbox",
        lambda *_: (_ for _ in ()).throw(AssertionError("probe consumed outbox")),
    )
    result = line.probe()
    assert result["database_ready"] and result["pending"] == 2
    assert result["line_token_present"] is False
    assert calls == ["line_delivery_metrics"]


def test_quota_probe_uses_get_and_excludes_provider_identity(monkeypatch):
    class Database:
        def rpc(self, _):
            return SimpleNamespace(execute=lambda: SimpleNamespace(data={}))

    monkeypatch.setattr(line.store_client, "get_client", lambda: Database())
    monkeypatch.setattr(settings, "line_channel_access_token", "secret")
    transport = httpx.MockTransport(
        lambda request: (
            httpx.Response(
                200,
                json={
                    "type": "limited",
                    "value": 200,
                    "totalUsage": 12,
                    "userId": "must-not-log",
                },
            )
            if request.method == "GET"
            else (_ for _ in ()).throw(AssertionError("LINE send during probe"))
        )
    )
    original = httpx.Client
    monkeypatch.setattr(
        line.httpx, "Client", lambda **kwargs: original(transport=transport, **kwargs)
    )
    result = line.probe()
    assert result["quota"] == {"type": "limited", "value": 200, "totalUsage": 12}
    assert "must-not-log" not in str(result) and "secret" not in str(result)


def test_health_requires_success_and_becomes_unhealthy_on_shutdown(monkeypatch):
    health = line.WorkerHealth()
    assert not health.healthy()
    health.ready = True
    assert health.healthy()
    monkeypatch.setattr(line.time, "monotonic", lambda: health.last_success + 181)
    assert not health.healthy()
    health.last_success += 181
    health.stopping = True
    assert not health.healthy()


def test_worker_health_http_is_local_and_does_not_expose_secrets():
    health = line.WorkerHealth()
    server = health.server(0)
    try:
        with httpx.Client(
            base_url=f"http://127.0.0.1:{server.server_address[1]}"
        ) as client:
            assert client.get("/health").status_code == 503
            health.ready = True
            assert client.get("/health").text == "ok"
            health.stopping = True
            assert client.get("/health").status_code == 503
    finally:
        server.shutdown()
        server.server_close()


def test_delivery_cutoff_is_exclusive_and_timezone_independent(monkeypatch):
    from datetime import UTC, datetime

    from backend.core.line_window import delivery_window_open

    monkeypatch.setattr(
        settings,
        "line_delivery_until",
        datetime.fromisoformat("2026-11-21T00:00:00+07:00"),
    )
    assert delivery_window_open(datetime(2026, 11, 20, 16, 59, 59, tzinfo=UTC))
    assert not delivery_window_open(datetime(2026, 11, 20, 17, tzinfo=UTC))
    assert not delivery_window_open(datetime(2026, 11, 21, tzinfo=UTC))
    monkeypatch.setattr(settings, "line_delivery_until", None)
    assert delivery_window_open(datetime(2030, 1, 1, tzinfo=UTC))


def test_provider_blocks_even_reserved_or_legacy_sends_after_deadline(monkeypatch):
    from datetime import UTC, datetime

    import pytest

    from backend.services import line_messaging

    monkeypatch.setattr(
        settings, "line_delivery_until", datetime(2000, 1, 1, tzinfo=UTC)
    )
    monkeypatch.setattr(
        line_messaging.httpx,
        "post",
        lambda *a, **k: pytest.fail("Expired trial sent LINE"),
    )
    for reserved in (False, True):
        with pytest.raises(line_messaging.LineProviderError) as error:
            line_messaging._post("unused", {}, budget_reserved=reserved)
        assert not error.value.attempted
        assert not error.value.retryable


def test_production_diagnostics_requires_cron_auth(monkeypatch):
    import pytest
    from fastapi import HTTPException

    from backend.routers.cron import line_delivery_status

    monkeypatch.setattr(settings, "local_demo_mode", False)
    monkeypatch.setattr(settings, "cron_secret", "private")
    monkeypatch.setattr(settings, "supabase_cron_secret", "other")
    with pytest.raises(HTTPException) as error:
        line_delivery_status(None)
    assert error.value.status_code == 401
    monkeypatch.setattr(line, "probe", lambda: {"database_ready": True})
    assert line_delivery_status("Bearer private") == {"database_ready": True}


def test_expired_worker_does_not_claim_or_prune(monkeypatch):
    import sys
    from datetime import UTC, datetime

    import pytest

    monkeypatch.setattr(
        settings, "line_delivery_until", datetime(2000, 1, 1, tzinfo=UTC)
    )
    monkeypatch.setattr(settings, "line_durable_delivery_enabled", True)
    monkeypatch.setattr(settings, "local_demo_mode", False)
    monkeypatch.setattr(sys, "argv", ["worker", "--once"])
    monkeypatch.setattr(line.signal, "signal", lambda *a: None)
    monkeypatch.setattr(
        line.store_client, "get_client", lambda: pytest.fail("Expired worker used DB")
    )
    monkeypatch.setattr(
        line.line_delivery, "process_inbox", lambda *a: pytest.fail("Claimed inbox")
    )
    monkeypatch.setattr(
        line.line_delivery, "process_outbox", lambda *a: pytest.fail("Claimed outbox")
    )
    line.main()
