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
