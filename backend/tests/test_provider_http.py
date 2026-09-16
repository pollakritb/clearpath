import asyncio

import httpx
import pytest

from backend.services.provider_http import get_json


def test_provider_http_retries_rate_limit_then_returns_json():
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(429, request=request, headers={"Retry-After": "0"})
        return httpx.Response(200, request=request, json={"ok": True})

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await get_json(client, "https://provider.test", params={})

    assert asyncio.run(run()) == {"ok": True}
    assert calls == 2


def test_provider_http_does_not_retry_non_retryable_client_error():
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(400, request=request, json={"error": "bad request"})

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            await get_json(client, "https://provider.test", params={})

    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(run())
    assert calls == 1
