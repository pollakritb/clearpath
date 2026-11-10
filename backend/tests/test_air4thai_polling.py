"""A warm cron instance must fetch the new hour despite scheduler jitter."""

import asyncio

import httpx

from backend.core import cache
from backend.core.cache import TTLCache
from backend.services import air4thai


def test_next_five_minute_poll_fetches_new_source_snapshot(monkeypatch):
    clock = [0.0]
    calls = []
    monkeypatch.setattr(cache.time, "monotonic", lambda: clock[0])
    monkeypatch.setattr(air4thai, "_cache", TTLCache(air4thai._cache.ttl))

    class Client:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def get(self, url, **kwargs):
            calls.append(url)
            return httpx.Response(
                200,
                request=httpx.Request("GET", url),
                json={
                    "stations": [
                        {
                            "stationID": "poll-test",
                            "lat": 13.7,
                            "long": 100.5,
                            "AQILast": {
                                "date": "2026-11-10",
                                "time": "05:00" if len(calls) == 1 else "06:00",
                                "PM25": {"value": "10"},
                            },
                        }
                    ]
                },
            )

    monkeypatch.setattr(air4thai.httpx, "AsyncClient", Client)
    first = asyncio.run(air4thai.fetch_stations())
    clock[0] = 20
    assert asyncio.run(air4thai.fetch_stations()) == first
    assert len(calls) == 1
    clock[0] = 299  # Next scheduled poll arrived one second early.
    second = asyncio.run(air4thai.fetch_stations())
    assert len(calls) == 2
    assert first[0]["recorded_at"] != second[0]["recorded_at"]
