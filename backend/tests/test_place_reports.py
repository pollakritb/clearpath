from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from backend.algorithms.place_reports import select_place_report_ids
from backend.main import create_app
from backend.services.community import place_reports

AT = datetime(2026, 11, 7, 5, tzinfo=UTC)


def row(id="r1", user="private-user", **changes):
    return (
        dict(
            id=id,
            user_id=user,
            public_lat=13.8,
            public_lon=100.1,
            lat=15,
            lon=101,
            pm25=34,
            status="approved",
            captured_at=AT.isoformat(),
        )
        | changes
    )


def test_latest_once_per_private_author_with_deterministic_ties():
    rows = [
        row("a"),
        row("z"),
        row("old", captured_at=(AT - timedelta(minutes=5)).isoformat()),
        row("b", "another"),
    ]
    assert select_place_report_ids(rows, 13.8, 100.1, at=AT) == ["z", "b"]
    assert select_place_report_ids(list(reversed(rows)), 13.8, 100.1, at=AT) == [
        "z",
        "b",
    ]


def test_newer_ineligible_or_outside_report_does_not_replace_latest_valid_nearby():
    rows = [
        row("valid", captured_at=(AT - timedelta(minutes=5)).isoformat()),
        row("outside", public_lat=15),
        row("bad", status="rejected"),
        row("nan", pm25=float("nan")),
        row("future", captured_at=(AT + timedelta(minutes=6)).isoformat()),
    ]
    assert select_place_report_ids(rows, 13.8, 100.1, at=AT) == ["valid"]


def test_three_hour_boundary_and_public_not_exact_coordinates():
    assert select_place_report_ids(
        [row(captured_at=(AT - timedelta(hours=3)).isoformat())], 13.8, 100.1, at=AT
    ) == ["r1"]
    assert (
        select_place_report_ids(
            [row(captured_at=(AT - timedelta(hours=3, seconds=1)).isoformat())],
            13.8,
            100.1,
            at=AT,
        )
        == []
    )


def test_service_keeps_author_identity_private_and_uses_public_coordinate_snapshot(
    monkeypatch,
):
    monkeypatch.setattr(
        place_reports.supabase_client,
        "get_map_history_reports",
        lambda *_: [
            row("new"),
            row("old", captured_at=(AT - timedelta(minutes=1)).isoformat()),
        ],
    )
    assert place_reports.place_report_selection(13.8, 100.1, AT) == ["new"]


def test_endpoint_contract_and_coordinate_time_validation(monkeypatch):
    monkeypatch.setattr(
        place_reports, "place_report_selection", lambda *_: ["RPT-000001"]
    )
    client = TestClient(create_app())
    response = client.get(
        "/api/community/place-report-selection", params={"lat": 13.8, "lon": 100.1}
    )
    assert response.status_code == 200
    assert set(response.json()) == {"report_ids", "target_at"}
    assert response.json()["report_ids"] == ["RPT-000001"]
    assert response.headers["cache-control"] == "no-store"
    assert (
        client.get("/api/community/place-report-selection?lat=91&lon=100").status_code
        == 422
    )
    assert (
        client.get(
            "/api/community/place-report-selection?lat=13&lon=100&at=2020-01-01T00:00:00Z"
        ).status_code
        == 422
    )
