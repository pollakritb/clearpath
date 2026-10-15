from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from backend.algorithms.external_forecast import select_horizon_rows, select_hourly_rows
from backend.core.config import settings
from backend.main import create_app
from backend.routers import forecast
from backend.services import external_forecast


def test_select_horizon_rows_returns_raw_provider_values():
    now = datetime(2026, 9, 17, 5, 15, tzinfo=UTC)
    rows = [
        {
            "forecast_at": (now + timedelta(hours=hour)).isoformat(),
            "pm25": value,
        }
        for hour, value in ((1, 11.2), (3, 12.3), (6, 14.6), (12, 18.1), (24, 20.4))
    ]

    result = select_horizon_rows(rows, [1, 3, 6, 12, 24], now=now)

    assert [row["horizon_hours"] for row in result] == [1, 3, 6, 12, 24]
    assert [row["pm25"] for row in result] == [11.2, 12.3, 14.6, 18.1, 20.4]


def test_select_hourly_rows_keeps_timestamps_and_raw_values():
    now = datetime(2026, 9, 17, 5, 15, tzinfo=UTC)
    rows = [
        {
            "forecast_at": (now.replace(minute=0) + timedelta(hours=hour)).isoformat(),
            "pm25": 10 + hour,
        }
        for hour in range(0, 30)
    ]

    result = select_hourly_rows(rows, 24, now=now)

    assert len(result) == 24
    assert result[0]["forecast_at"] == "2026-09-17T06:00:00+00:00"
    assert result[-1]["forecast_at"] == "2026-09-18T05:00:00+00:00"
    assert [row["horizon_hours"] for row in result] == list(range(1, 25))
    assert result[0]["pm25"] == 11.0


def test_select_hourly_rows_does_not_hide_missing_hours():
    now = datetime(2026, 9, 17, 5, 15, tzinfo=UTC)
    rows = [
        {"forecast_at": f"2026-09-17T{hour:02d}:00:00+00:00", "pm25": 12}
        for hour in (6, 7, 9)
    ]
    selected = select_hourly_rows(rows, 24, now=now)
    assert [row["forecast_at"] for row in selected] == [
        "2026-09-17T06:00:00+00:00",
        "2026-09-17T07:00:00+00:00",
    ]


def test_area_forecast_target_is_validated_and_served(monkeypatch):
    monkeypatch.setattr(settings, "external_forecast_enabled", True)

    async def area_result(lat: float, lon: float, hours: int):
        assert (lat, lon, hours) == (13.8, 100.1, 24)
        return {
            "station_id": None,
            "target_kind": "area",
            "requested_lat": lat,
            "requested_lon": lon,
            "generated_at": datetime.now(UTC).isoformat(),
            "horizon_hours": hours,
            "method": "raw_openmeteo_cams",
            "source_points": 0,
            "coverage_target": 0,
            "data_quality": "limited",
            "quality": external_forecast._quality(0, datetime.now(UTC).isoformat()),
            "fallback_reason_codes": [],
            "warnings": [],
            "points": [],
            "forecast_mode": "external_provider",
            "selection_evidence": external_forecast._selection_evidence(),
            "community_context": external_forecast._community_context(),
        }

    monkeypatch.setattr(forecast.external_forecast, "area_forecast", area_result)
    client = TestClient(create_app())
    assert client.get("/api/forecast?lat=13.8&lon=100.1&hours=24").status_code == 200
    assert client.get("/api/forecast?lat=13.8").status_code == 422
    assert (
        client.get("/api/forecast?station_id=103t&lat=13.8&lon=100.1").status_code
        == 422
    )
    assert client.get("/api/forecast?lat=35&lon=100").status_code == 422


def test_area_forecast_has_24_future_hours_and_both_coordinate_pairs(monkeypatch):
    async def rows_for_area(locations: list[dict], *, forecast_hours: int):
        assert forecast_hours >= 27
        assert locations == [{"id": "target", "lat": 13.8, "lon": 100.1}]
        fetched = datetime.now(UTC)
        first = fetched.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
        return {
            "target": [
                {
                    "forecast_at": (first + timedelta(hours=hour)).isoformat(),
                    "pm25": 10 + hour,
                    "source_lat": 13.75,
                    "source_lon": 100.25,
                    "fetched_at": fetched.isoformat(),
                }
                for hour in range(27)
            ]
        }

    monkeypatch.setattr(external_forecast.openmeteo_air, "get_forecasts", rows_for_area)
    result = asyncio.run(external_forecast.area_forecast(13.8, 100.1, 24))
    assert len(result["points"]) == 24
    assert result["requested_lat"] == 13.8
    assert result["requested_lon"] == 100.1
    assert result["grid_lat"] == 13.75
    assert result["grid_lon"] == 100.25
    assert result["points"][0]["valid_at"] == result["points"][0]["forecast_at"]
    assert result["points"][-1]["horizon_hours"] == 24
    assert "external_provider_partial_horizon" not in result["limitation_reason_codes"]


def test_forecast_route_serves_only_openmeteo_cams(monkeypatch):
    monkeypatch.setattr(settings, "external_forecast_enabled", True)

    async def external_result(station_id: str, hours: int):
        generated_at = datetime.now(UTC).isoformat()
        point = {
            "horizon_hours": 1,
            "forecast_at": generated_at,
            "pm25": 12.5,
            "lower": 12.5,
            "upper": 12.5,
            "method": "raw_openmeteo_cams",
            "coverage_target": 0,
            "calibration_version": "not_applicable",
            "provider_count": 1,
            "source": "openmeteo_cams",
        }
        return {
            "station_id": station_id,
            "generated_at": generated_at,
            "source_recorded_at": generated_at,
            "horizon_hours": hours,
            "method": "raw_openmeteo_cams",
            "source_points": 1,
            "coverage_target": 0,
            "data_quality": "limited",
            "quality": {
                "status": "limited",
                "ml_eligible": False,
                "reason_codes": ["single_external_provider"],
                "warnings": ["single_external_provider"],
                "source_recorded_at": generated_at,
                "input_freshness_minutes": 0,
                "source_points": 1,
                "recent_required_points": 0,
                "missing_hours": 0,
                "duplicate_hours": 0,
                "optional_feature_completeness": 0,
                "optional_feature_states": {},
            },
            "fallback_reason_codes": [],
            "warnings": ["single_external_provider"],
            "points": [point],
            "forecast_status": "limited",
            "limitation_reason_codes": ["single_external_provider"],
            "provider_count": 1,
            "sources": [],
            "provenance": {"value_policy": "raw_provider_value"},
            "forecast_mode": "external_provider",
            "recommended_source": "openmeteo_cams",
            "providers": [],
            "selection_evidence": {
                "basis": "freshness_fallback",
                "horizon_hours": None,
                "window_days": 0,
                "minimum_rows": 0,
                "ranked_sources": ["openmeteo_cams"],
                "scores": [],
                "evaluated_at": None,
                "expires_at": None,
            },
            "community_context": {
                "mode": "not_used",
                "affects_recommendation": False,
                "eligible_report_count": 0,
                "nearby_report_count": 0,
                "effective_sample_size": 0,
                "residual_pm25": 0,
                "policy": "external-provider-only-v1",
            },
        }

    monkeypatch.setattr(forecast.external_forecast, "station_forecast", external_result)
    response = TestClient(create_app()).get(
        "/api/forecast?station_id=station-1&hours=24"
    )

    assert response.status_code == 200
    assert response.json()["recommended_source"] == "openmeteo_cams"
    assert response.json()["points"][0]["pm25"] == 12.5
    assert response.headers["cache-control"].startswith("public")
