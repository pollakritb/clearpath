import asyncio

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.algorithms.place_labels import geoapify_label, photon_label
from backend.core.config import settings
from backend.core.errors import UpstreamError
from backend.main import create_app
from backend.services import photon_reverse, place_labels


def test_named_poi_only_when_close_otherwise_use_returned_area():
    row = {
        "country_code": "th",
        "name": "Central Embassy",
        "result_type": "amenity",
        "lat": 13.8,
        "lon": 100.1,
        "district": "ปทุมวัน",
        "city": "กรุงเทพมหานคร",
    }
    label = geoapify_label({"results": [row]}, 13.8, 100.1)
    assert label["name"] == "บริเวณCentral Embassy"
    assert label["address"] == "ปทุมวัน · กรุงเทพมหานคร"
    distant = geoapify_label({"results": [{**row, "lat": 14.0}]}, 13.8, 100.1)
    assert distant["name"] == "บริเวณปทุมวัน"
    assert "Central" not in distant["name"]
    assert (
        geoapify_label({"results": [{**row, "country_code": "my"}]}, 13.8, 100.1)
        is None
    )


def test_photon_street_is_not_mistaken_for_a_named_poi():
    properties = {
        "countrycode": "TH",
        "name": "ทางหลวง 346",
        "osm_key": "highway",
        "locality": "กำแพงแสน",
        "state": "นครปฐม",
    }
    feature = {"properties": properties, "geometry": {"coordinates": [99.97, 14.02]}}
    label = photon_label({"features": [feature]}, 14.02, 99.97)
    assert label["name"] == "บริเวณกำแพงแสน"
    assert label["address"] == "กำแพงแสน · นครปฐม"
    assert (
        photon_label(
            {"features": [{**feature, "properties": {"countrycode": "TH"}}]},
            14.02,
            99.97,
        )
        is None
    )


@pytest.mark.parametrize(
    "payload",
    [
        {},
        [],
        {"features": None},
        {"features": [{}, None, {"properties": {}, "geometry": {"coordinates": []}}]},
    ],
)
def test_malformed_reverse_response_never_invents_a_name(payload):
    assert photon_label(payload, 14, 100) is None
    assert geoapify_label(payload, 14, 100) is None


def test_provider_failure_uses_containing_province_not_nearest_gazetteer(
    monkeypatch,
):
    place_labels._cache.clear()
    monkeypatch.setattr(settings, "geoapify_api_key", "")

    async def fail(*args):
        raise UpstreamError("offline")

    monkeypatch.setattr(photon_reverse, "resolve", fail)
    result = asyncio.run(place_labels.resolve_label(14.02, 99.97))
    assert result == {"name": "จังหวัดนครปฐม", "address": "", "source": "local"}


def test_empty_reverse_result_uses_province_for_the_reported_rural_point(monkeypatch):
    place_labels._cache.clear()
    monkeypatch.setattr(settings, "geoapify_api_key", "")

    async def empty(*args):
        return None

    monkeypatch.setattr(photon_reverse, "resolve", empty)
    assert (
        asyncio.run(place_labels.resolve_label(15.3418, 99.99825))["name"]
        == "จังหวัดอุทัยธานี"
    )


def test_reverse_prefers_close_named_poi_over_first_generic_area():
    def feature(properties):
        return {
            "properties": {"countrycode": "TH", **properties},
            "geometry": {"coordinates": [100, 14]},
        }

    label = photon_label(
        {
            "features": [
                feature({"state": "นครปฐม"}),
                feature({"name": "สถานที่ทดสอบ", "osm_key": "amenity"}),
            ]
        },
        14,
        100,
    )
    assert label["name"] == "บริเวณสถานที่ทดสอบ"


def test_administrative_result_can_supply_its_own_name_without_parent_fields():
    assert (
        photon_label(
            {
                "features": [
                    {
                        "properties": {
                            "countrycode": "TH",
                            "osm_key": "place",
                            "name": "ตำบลทดสอบ",
                        },
                        "geometry": {"coordinates": [100, 14]},
                    }
                ]
            },
            14,
            100,
        )["name"]
        == "บริเวณตำบลทดสอบ"
    )
    assert (
        geoapify_label(
            {
                "results": [
                    {
                        "country_code": "th",
                        "result_type": "city",
                        "name": "นครปฐม",
                        "lat": 14,
                        "lon": 100,
                    }
                ]
            },
            14,
            100,
        )["name"]
        == "บริเวณนครปฐม"
    )


def test_adapters_and_cache_use_requested_coordinates_without_snapping(
    monkeypatch,
):
    place_labels._cache.clear()
    monkeypatch.setattr(settings, "geoapify_api_key", "test-server-key")
    seen = []

    def transport(request):
        seen.append(request)
        return httpx.Response(
            200,
            json={
                "results": [
                    {
                        "name": "มหาวิทยาลัยเกษตรศาสตร์",
                        "result_type": "amenity",
                        "country_code": "th",
                        "lat": 14.02,
                        "lon": 99.97,
                        "city": "กำแพงแสน",
                        "state": "นครปฐม",
                    }
                ]
            },
        )

    original = httpx.AsyncClient
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda **kw: original(transport=httpx.MockTransport(transport), **kw),
    )
    first = asyncio.run(place_labels.resolve_label(14.02, 99.97))
    assert asyncio.run(place_labels.resolve_label(14.02, 99.97)) == first
    assert len(seen) == 1
    assert seen[0].url.params["lat"] == "14.02"
    assert first["name"] == "บริเวณมหาวิทยาลัยเกษตรศาสตร์"


def test_reverse_route_validates_coordinates_and_returns_private_response(monkeypatch):
    from backend.routers import locations

    async def resolve(lat, lon):
        assert (lat, lon) == (14.02, 99.97)
        return {"name": "บริเวณกำแพงแสน", "address": "นครปฐม", "source": "photon"}

    monkeypatch.setattr(locations, "resolve_label", resolve)
    client = TestClient(create_app())
    response = client.get("/api/locations/reverse?lat=14.02&lon=99.97")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "private, no-store"
    assert response.json()["name"] == "บริเวณกำแพงแสน"
    assert client.get("/api/locations/reverse?lat=90&lon=99.97").status_code == 422
