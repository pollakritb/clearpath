import httpx
import pytest

from backend.services import supabase_client


def test_get_client_disables_http2_for_supabase_transport(monkeypatch):
    captured = {}
    transport = object()
    http_client = object()
    created_client = object()

    monkeypatch.setattr(supabase_client, "_client", None)
    monkeypatch.setattr(
        supabase_client.settings, "supabase_url", "https://example.test"
    )
    monkeypatch.setattr(supabase_client.settings, "supabase_service_role_key", "secret")

    def fake_transport(**kwargs):
        captured["transport"] = kwargs
        return transport

    def fake_http_client(**kwargs):
        captured["http_client"] = kwargs
        return http_client

    def fake_create_client(url, key, *, options):
        captured["create"] = (url, key, options)
        return created_client

    monkeypatch.setattr(supabase_client.httpx, "HTTPTransport", fake_transport)
    monkeypatch.setattr(supabase_client.httpx, "Client", fake_http_client)
    monkeypatch.setattr(supabase_client, "create_client", fake_create_client)

    assert supabase_client.get_client() is created_client
    assert captured["transport"] == {"http2": False, "retries": 2}
    assert captured["http_client"]["transport"] is transport
    assert captured["create"][2].httpx_client is http_client


def test_execute_read_retries_transient_transport_errors(monkeypatch):
    calls = 0
    monkeypatch.setattr(supabase_client, "_READ_RETRY_DELAYS_SECONDS", (0, 0))

    def operation():
        nonlocal calls
        calls += 1
        if calls < 3:
            raise httpx.ReadError("temporary disconnect")
        return "ok"

    assert supabase_client._execute_read(operation) == "ok"
    assert calls == 3


def test_execute_read_raises_after_retry_budget(monkeypatch):
    calls = 0
    monkeypatch.setattr(supabase_client, "_READ_RETRY_DELAYS_SECONDS", (0, 0))

    def operation():
        nonlocal calls
        calls += 1
        raise httpx.ReadError("persistent disconnect")

    with pytest.raises(httpx.ReadError):
        supabase_client._execute_read(operation)

    assert calls == 3
