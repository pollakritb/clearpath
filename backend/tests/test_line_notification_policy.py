from datetime import UTC, datetime, timedelta
from uuid import UUID

import pytest

from backend.algorithms.line_notification_policy import (
    LINE_EVENT_TYPES,
    air_alert_eligible,
    line_event_type,
    line_retry_key,
)

NOW = datetime(2026, 11, 11, 5, tzinfo=UTC)


def air():
    return {
        "source_at": (NOW - timedelta(minutes=10)).isoformat(),
        "pm25": 40,
        "lat": 13.7,
        "lon": 100.5,
    }


def prefs():
    return {
        "air_alerts": True,
        "pm25_threshold": 37.5,
        "center_lat": 13.7,
        "center_lon": 100.5,
        "radius_km": 2,
    }


def test_only_three_automatic_events_are_allowed():
    assert {
        "measurement_request",
        "measurement_fulfilled",
        "air_alert",
    } == LINE_EVENT_TYPES


@pytest.mark.parametrize(
    "payload,expected",
    [
        ({"event_type": "report_status"}, "report_status"),
        ({"measurement_kind": "measurement_expired"}, "measurement_expired"),
        ({"measurement_group_id": "123"}, "measurement_request"),
        ({"tag": "measurement-group:123"}, "measurement_request"),
        (
            {"tag": "measurement:req:measurement_fulfilled:user"},
            "measurement_fulfilled",
        ),
        ({"tag": "alert:pm25:station:time:user"}, "air_alert"),
        ({"tag": "alert:hotspot:user"}, None),
        ({"tag": "report_status:123"}, None),
        ({}, None),
    ],
)
def test_legacy_queue_classification_is_structured_and_fails_closed(payload, expected):
    assert line_event_type(payload) == expected


def test_retry_keys_are_valid_stable_and_preserve_existing_uuid():
    assert UUID(line_retry_key("123"))
    assert line_retry_key("123") == line_retry_key("123", "not-a-uuid")
    assert line_retry_key("123") != line_retry_key("124")
    existing = "4bca1641-9759-468b-a910-57ec6d3b31a9"
    assert line_retry_key("123", existing) == existing


@pytest.mark.parametrize(
    "patch",
    [
        {"source_at": None},
        {"source_at": (NOW - timedelta(minutes=91)).isoformat()},
        {"source_at": (NOW + timedelta(minutes=1)).isoformat()},
        {"pm25": 10},
        {"pm25": float("nan")},
        {"pm25": float("inf")},
        {"lat": 91},
        {"lon": 180},
    ],
)
def test_air_alert_rechecks_time_measurement_and_area(patch):
    assert not air_alert_eligible(air() | patch, prefs(), NOW)


@pytest.mark.parametrize(
    "patch",
    [
        {"air_alerts": False},
        {"center_lat": None},
        {"radius_km": 51},
        {"radius_km": 0},
        {"radius_km": None},
        {"pm25_threshold": 100},
    ],
)
def test_preferences_are_checked_again_before_delivery(patch):
    assert not air_alert_eligible(air(), prefs() | patch, NOW)


def test_valid_air_alert_and_zero_threshold_are_supported():
    assert air_alert_eligible(air(), prefs(), NOW)
    assert air_alert_eligible(air() | {"pm25": 0}, prefs() | {"pm25_threshold": 0}, NOW)
