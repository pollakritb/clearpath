from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from backend.algorithms.external_forecast import select_horizon_rows, select_hourly_rows
from backend.core.config import settings
from backend.main import create_app
from backend.routers import forecast


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
