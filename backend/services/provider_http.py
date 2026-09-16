"""Bounded HTTP retry policy shared by external forecast adapters."""

from __future__ import annotations

import asyncio
from collections.abc import Mapping
from typing import Any

import httpx

RETRYABLE_STATUS_CODES = frozenset({429, 500, 502, 503, 504})


async def get_json(
    client: httpx.AsyncClient,
    url: str,
    *,
    params: Mapping[str, object],
    attempts: int = 2,
) -> Any:
    """GET JSON with a small retry budget safe for a 60-second function."""

    last_error: Exception | None = None
    for attempt in range(max(1, attempts)):
        try:
            response = await client.get(url, params=params)
            if response.status_code not in RETRYABLE_STATUS_CODES:
                response.raise_for_status()
                return response.json()
            last_error = httpx.HTTPStatusError(
                f"retryable provider status {response.status_code}",
                request=response.request,
                response=response,
            )
            retry_after = response.headers.get("Retry-After")
            try:
                delay = float(retry_after) if retry_after is not None else 0.25
            except ValueError:
                delay = 0.25 * (attempt + 1)
            delay = min(2.0, max(0.0, delay))
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            last_error = exc
            delay = 0.25 * (attempt + 1)
        except (TypeError, ValueError) as exc:
            raise httpx.DecodingError("provider returned invalid JSON") from exc
        if attempt + 1 < max(1, attempts):
            await asyncio.sleep(delay)
    assert last_error is not None
    raise last_error
