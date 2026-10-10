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


def test_search_without_key_uses_photon_for_partial_queries(monkeypatch):
    monkeypatch.setattr(places.settings, "geoapify_api_key", "")
    places._cache.clear()
    calls = []

    async def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        assert request.url.host == "photon.komoot.io"
        assert request.url.params["countrycode"] == "TH"
        return httpx.Response(
            200,
            json={
                "features": [
                    {
                        "properties": {
                            "osm_type": "W",
                            "osm_id": 123,
                            "name": "เซ็นทรัลเวิลด์",
                            "countrycode": "TH",
                            "city": "กรุงเทพมหานคร",
                            "osm_value": "mall",
                        },
                        "geometry": {"coordinates": [100.539, 13.746]},
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
    first = asyncio.run(places.search_places("เซ็นทรัลเวิล"))
    second = asyncio.run(places.search_places("เซ็นทรัลเวิล"))
    assert first == second
    assert first[1] == "nationwide"
    assert first[0][0]["source"] == "photon"
    assert first[0][0]["name"] == "เซ็นทรัลเวิลด์"
    assert len(calls) == 1


def test_photon_ignores_places_outside_thailand():
    results = places._parse_photon_results(
        {
            "features": [
                {
                    "properties": {"countrycode": "SG", "name": "Outside"},
                    "geometry": {"coordinates": [103.8, 1.3]},
                },
                {
                    "properties": {"countrycode": "TH", "name": "ศาลายา", "osm_id": 1},
                    "geometry": {"coordinates": [100.32, 13.8]},
                },
            ]
        },
        10,
    )
    assert [row["name"] for row in results] == ["ศาลายา"]


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
