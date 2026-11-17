from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

from backend.core.errors import ConfigurationError, UpstreamError
from backend.services import fire_feed


def test_fire_feed_reports_unconfigured_without_raising(monkeypatch):
    async def missing_key(_days: int):
        raise ConfigurationError("missing key")

    monkeypatch.setattr(fire_feed.firms, "get_fires", missing_key)
    result = asyncio.run(fire_feed.get_public_fires(1))

    assert result.fires == []
    assert result.available is False
    assert result.status == "unconfigured"
    assert result.message is not None
    assert "NASA FIRMS" in result.message


def test_fire_feed_reports_upstream_outage_without_false_clear(monkeypatch):
    async def upstream_outage(_days: int):
        raise UpstreamError("temporary")

    monkeypatch.setattr(fire_feed.firms, "get_fires", upstream_outage)
    result = asyncio.run(fire_feed.get_public_fires(1))

    assert result.fires == []
    assert result.available is False
    assert result.status == "unavailable"
    assert "ขัดข้อง" in (result.message or "")


def test_fire_feed_distinguishes_positive_clear_and_stale(monkeypatch):
    now = datetime(2026, 9, 16, 12, tzinfo=UTC)

    async def fresh(_days: int):
        return [
            {
                "lat": 13.82,
                "lon": 100.06,
                "frp": 10,
                "acquired_at": (now - timedelta(hours=1)).isoformat(),
                "satellite": "VIIRS",
            }
        ]

    monkeypatch.setattr(fire_feed.firms, "get_fires", fresh)
    positive = asyncio.run(fire_feed.get_public_fires(1, now=now))
    assert positive.status == "available"
    assert positive.available is True
    assert len(positive.fires) == 1

    async def empty(_days: int):
        return []

    monkeypatch.setattr(fire_feed.firms, "get_fires", empty)
    clear = asyncio.run(fire_feed.get_public_fires(1, now=now))
    assert clear.status == "checked_no_hotspots"
    assert clear.fires == []

    async def stale(_days: int):
        return [
            {
                "lat": 13.82,
                "lon": 100.06,
                "frp": 10,
                "acquired_at": (now - timedelta(hours=13)).isoformat(),
                "satellite": "VIIRS",
            }
        ]

    monkeypatch.setattr(fire_feed.firms, "get_fires", stale)
    stale_feed = asyncio.run(fire_feed.get_public_fires(1, now=now))
    assert stale_feed.status == "stale"
    assert stale_feed.fires == []
    assert stale_feed.latest_acquired_at == (now - timedelta(hours=13)).isoformat()
