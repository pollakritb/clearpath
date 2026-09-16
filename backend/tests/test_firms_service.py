from __future__ import annotations

import asyncio

import httpx
import pytest

from backend.core.config import settings
from backend.core.errors import ConfigurationError, UpstreamError
from backend.services import firms


class _Response:
    def __init__(self, text: str, *, fail: bool = False):
        self.text = text
        self.fail = fail

    def raise_for_status(self) -> None:
        if self.fail:
            raise httpx.ConnectError(
                "provider unavailable", request=httpx.Request("GET", "https://firms")
            )


class _Client:
    def __init__(self, responses: list[_Response], calls: list[str]):
        self.responses = responses
        self.calls = calls

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def get(self, url: str) -> _Response:
        self.calls.append(url)
        return self.responses.pop(0)


def _reset_cache() -> None:
    firms._CACHE.update({"ts": 0.0, "data": None, "key": None})


def test_firms_requires_map_key(monkeypatch):
    _reset_cache()
    monkeypatch.setattr(settings, "firms_map_key", "")
    with pytest.raises(ConfigurationError):
        asyncio.run(firms.get_fires())


def test_firms_parses_deduplicates_and_caches_products(monkeypatch):
    _reset_cache()
    monkeypatch.setattr(settings, "firms_map_key", "map-key")
    calls: list[str] = []
    header = "latitude,longitude,frp,bright_ti4,daynight,acq_date,acq_time,confidence\n"
    responses = [
        _Response(header + "13.8201,100.0601,5,320,D,2026-09-16,0030,n\n"),
        _Response(
            header
            + "13.8202,100.0602,25,330,N,2026-09-16,0030,h\n"
            + "invalid,100.1,3,300,D,not-a-date,99,n\n"
        ),
        _Response(header, fail=True),
    ]
    monkeypatch.setattr(
        firms.httpx,
        "AsyncClient",
        lambda **_kwargs: _Client(responses, calls),
    )

    result = asyncio.run(firms.get_fires(2))

    assert len(result) == 1
    assert result[0]["frp"] == 25.0
    assert result[0]["bright"] == 330.0
    assert result[0]["acquired_at"] == "2026-09-16T00:30:00+00:00"
    assert result[0]["satellite"] == "VIIRS_NOAA20_NRT"
    assert result[0]["id"].startswith("firms-")
    assert result[0]["source_products"] == [
        "VIIRS_NOAA20_NRT",
        "VIIRS_SNPP_NRT",
    ]
    assert len(calls) == 3

    cached = asyncio.run(firms.get_fires(2))
    assert cached is result
    assert len(calls) == 3


def test_firms_fails_only_when_every_supported_product_fails(monkeypatch):
    _reset_cache()
    monkeypatch.setattr(settings, "firms_map_key", "map-key")
    calls: list[str] = []
    responses = [_Response("", fail=True) for _source in firms.SOURCES]
    monkeypatch.setattr(
        firms.httpx,
        "AsyncClient",
        lambda **_kwargs: _Client(responses, calls),
    )

    with pytest.raises(UpstreamError):
        asyncio.run(firms.get_fires())
    assert len(calls) == len(firms.SOURCES)


def test_firms_parsers_reject_invalid_values():
    assert firms._f(None) is None
    assert firms._f("bad") is None
    assert firms._acquired_at({"acq_date": "bad", "acq_time": "bad"}) is None
