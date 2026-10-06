import asyncio

import httpx

from backend.services import places


def test_parse_provider_results_keeps_only_valid_thai_places():
    rows = places._parse_results(
        {
            "results": [
                {
                    "place_id": "one",
                    "name": "ตลาดตัวอย่าง",
                    "formatted": "นครปฐม ประเทศไทย",
                    "country_code": "th",
                    "lat": 13.8,
                    "lon": 100.1,
                },
                {
                    "place_id": "outside",
                    "name": "Other place",
                    "country_code": "sg",
                    "lat": 1.3,
                    "lon": 103.8,
                },
            ]
        },
        10,
    )
    assert len(rows) == 1
    assert rows[0]["source"] == "geoapify"
    assert rows[0]["name"] == "ตลาดตัวอย่าง"


def test_search_without_key_uses_limited_local_fallback(monkeypatch):
    monkeypatch.setattr(places.settings, "geoapify_api_key", "")
    monkeypatch.setattr(places.settings, "app_environment", "production")
    results, coverage = asyncio.run(places.search_places("ศาลายา"))
    assert coverage == "limited"
    assert results[0]["source"] == "local"


def test_local_development_searches_real_osm_places_only_on_request(monkeypatch):
    monkeypatch.setattr(places.settings, "geoapify_api_key", "")
    monkeypatch.setattr(places.settings, "app_environment", "development")
    places._cache.clear()
    calls = []

    async def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        assert request.url.host == "nominatim.openstreetmap.org"
        assert "ClearPath-local-development" in request.headers["user-agent"]
        return httpx.Response(
            200,
            json=[
                {
                    "osm_type": "way",
                    "osm_id": 123,
                    "name": "CentralWorld",
                    "display_name": "CentralWorld, Bangkok, Thailand",
                    "type": "mall",
                    "lat": "13.746",
                    "lon": "100.539",
                }
            ],
        )

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        places.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs),
    )
    first = asyncio.run(places.search_places("CentralWorld"))
    second = asyncio.run(places.search_places("centralworld"))
    assert first == second
    assert first[0][0]["source"] == "openstreetmap"
    assert first[0][0]["name"] == "CentralWorld"
    assert len(calls) == 1


def test_provider_search_normalizes_and_caches_results(monkeypatch):
    monkeypatch.setattr(places.settings, "geoapify_api_key", "test-only-key")
    places._cache.clear()
    calls = []

    async def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(
            200,
            json={
                "results": [
                    {
                        "place_id": "one",
                        "name": "Test Market",
                        "formatted": "Nakhon Pathom, Thailand",
                        "country_code": "th",
                        "lat": 13.8,
                        "lon": 100.1,
                    }
                ]
            },
        )

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        places.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs),
    )
    first = asyncio.run(places.search_places("Test Market"))
    second = asyncio.run(places.search_places("test   market"))
    assert first == second
    assert first[1] == "nationwide"
    assert first[0][0]["name"] == "Test Market"
    assert len(calls) == 1


def test_provider_failure_falls_back_without_exposing_key(monkeypatch):
    monkeypatch.setattr(places.settings, "geoapify_api_key", "test-only-key")
    places._cache.clear()
    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        places.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(
            transport=httpx.MockTransport(lambda _request: httpx.Response(429)),
            **kwargs,
        ),
    )
    results, coverage = asyncio.run(places.search_places("ศาลายา"))
    assert coverage == "limited"
    assert results[0]["source"] == "local"
    assert "test-only-key" not in str(results)
