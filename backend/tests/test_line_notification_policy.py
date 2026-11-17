from datetime import UTC, datetime
from uuid import UUID

import pytest

from backend.algorithms.line_notification_policy import (
    LINE_EVENT_TYPES,
    line_event_type,
    line_retry_key,
)

NOW = datetime(2026, 11, 11, 5, tzinfo=UTC)


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
