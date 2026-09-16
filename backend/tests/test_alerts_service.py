from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import pytest

from backend.core.config import settings
from backend.core.errors import UpstreamError
from backend.services import alerts


def test_alerts_short_circuit_when_push_is_disabled(monkeypatch):
    monkeypatch.setattr(settings, "push_enabled", False)
    assert asyncio.run(alerts.run_alerts()) == {
        "ok": True,
        "disabled": True,
        "events": 0,
        "recipients": 0,
    }


def test_alerts_publish_fresh_air_and_nakhon_pathom_hotspot(monkeypatch):
    monkeypatch.setattr(settings, "push_enabled", True)
    now = datetime.now(UTC)
    recorded_at = (now - timedelta(minutes=10)).isoformat()
    hotspot_at = (now - timedelta(hours=1)).isoformat()
    preferences = [
        {
            "user_id": "near-user",
            "air_alerts": True,
            "hotspot_alerts": True,
            "pm25_threshold": 37.5,
            "center_lat": 13.82,
            "center_lon": 100.06,
            "radius_km": 10,
        },
        {
            "user_id": "far-user",
            "center_lat": 18.8,
            "center_lon": 98.9,
            "radius_km": 2,
        },
    ]
    stations = [
        {
            "id": "fresh-high",
            "name_th": "station",
            "lat": 13.82,
            "lon": 100.06,
            "pm25": 80,
            "recorded_at": recorded_at,
        },
        {
            "id": "missing",
            "lat": 13.82,
            "lon": 100.06,
            "pm25": None,
            "recorded_at": None,
        },
        {
            "id": "stale",
            "lat": 13.82,
            "lon": 100.06,
            "pm25": 100,
            "recorded_at": (now - timedelta(hours=2)).isoformat(),
        },
    ]
    fires = [
        {
            "lat": 13.82,
            "lon": 100.06,
            "frp": 25,
            "acquired_at": hotspot_at,
            "satellite": "VIIRS",
        },
        {
            "lat": 13.8205,
            "lon": 100.0605,
            "frp": 20,
            "acquired_at": (now - timedelta(minutes=50)).isoformat(),
            "satellite": "VIIRS_NOAA20_NRT",
        },
        {
            "lat": 18.8,
            "lon": 98.9,
            "frp": 50,
            "acquired_at": hotspot_at,
        },
        {"lat": 13.82, "lon": 100.06, "frp": 50, "acquired_at": None},
        {
            "lat": 13.82,
            "lon": 100.06,
            "frp": 50,
            "acquired_at": (now - timedelta(hours=13)).isoformat(),
        },
    ]
    published: list[dict] = []

    async def current_stations():
        return stations, "supabase"

    async def current_fires(_days: int):
        return fires

    def publish_alert(**kwargs):
        published.append(kwargs)
        return {"recipient_count": len(kwargs["recipients"])}

    monkeypatch.setattr(
        alerts.supabase_client, "list_notification_preferences", lambda: preferences
    )
    monkeypatch.setattr(alerts, "get_current_stations", current_stations)
    monkeypatch.setattr(alerts.firms, "get_fires", current_fires)
    monkeypatch.setattr(alerts.notifications, "publish_alert", publish_alert)

    result = asyncio.run(alerts.run_alerts())

    assert result == {"ok": True, "disabled": False, "events": 2, "recipients": 2}
    assert [item["kind"] for item in published] == [
        "pm25_threshold",
        "satellite_hotspot",
    ]
    assert [item["severity"] for item in published] == ["danger", "warning"]
    assert all(item["recipients"] == ["near-user"] for item in published)
    assert "Air4Thai" in published[0]["body"]
    assert "NASA FIRMS (VIIRS)" in published[1]["body"]
    assert "ยังไม่ใช่เหตุไฟไหม้ที่ยืนยันแล้ว" in published[1]["body"]


def test_alerts_keep_air_alerts_when_firms_fails_and_ignore_empty_targets(
    monkeypatch,
):
    monkeypatch.setattr(settings, "push_enabled", True)
    now = datetime.now(UTC).isoformat()

    async def current_stations():
        return [
            {
                "id": "low",
                "lat": 13.82,
                "lon": 100.06,
                "pm25": 10,
                "recorded_at": now,
            }
        ], "supabase"

    async def failed_fires(_days: int):
        raise UpstreamError("FIRMS failed")

    monkeypatch.setattr(
        alerts.supabase_client,
        "list_notification_preferences",
        lambda: [{"user_id": "user", "pm25_threshold": 37.5}],
    )
    monkeypatch.setattr(alerts, "get_current_stations", current_stations)
    monkeypatch.setattr(alerts.firms, "get_fires", failed_fires)
    monkeypatch.setattr(
        alerts.notifications,
        "publish_alert",
        lambda **_kwargs: pytest.fail("no alert should be published"),
    )

    assert asyncio.run(alerts.run_alerts()) == {
        "ok": True,
        "disabled": False,
        "events": 0,
        "recipients": 0,
    }


def test_alert_preference_without_center_is_nationwide():
    assert alerts._near_preference({}, 13.8, 100.1) is True
