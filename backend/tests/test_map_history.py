from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient

from backend.algorithms.map_history import select_map_history_stations
from backend.main import create_app
from backend.routers import history


def test_selects_latest_reading_at_or_before_target_and_ignores_future():
    stations = [
        {"id": "a", "name_th": "A", "lat": 13.75, "lon": 100.5},
        {"id": "b", "name_th": "B", "lat": 18.8, "lon": 98.9},
    ]
    readings = [
        {
            "station_id": "a",
            "pm25": 11,
            "aqi": 20,
            "recorded_at": "2026-09-19T08:00:00+00:00",
        },
        {
            "station_id": "a",
            "pm25": 14,
            "aqi": 24,
            "recorded_at": "2026-09-19T09:00:00+00:00",
        },
        {
            "station_id": "a",
            "pm25": 99,
            "aqi": 99,
            "recorded_at": "2026-09-19T10:01:00+00:00",
        },
    ]

    result = select_map_history_stations(
        stations,
        readings,
        target_at=datetime(2026, 9, 19, 10, tzinfo=UTC),
    )

    assert len(result) == 1
    assert result[0]["id"] == "a"
    assert result[0]["pm25"] == 14
    assert result[0]["recorded_at"] == "2026-09-19T09:00:00+00:00"
    assert result[0]["data_status"] == "fresh"


def test_excludes_missing_and_stale_readings():
    stations = [{"id": "a", "lat": 13.75, "lon": 100.5}]
    readings = [
        {
            "station_id": "a",
            "pm25": 20,
            "recorded_at": "2026-09-19T08:00:00+00:00",
        },
        {
            "station_id": "a",
            "pm25": None,
            "recorded_at": "2026-09-19T09:30:00+00:00",
        },
    ]

    result = select_map_history_stations(
        stations,
        readings,
        target_at=datetime(2026, 9, 19, 10, tzinfo=UTC),
        max_age_minutes=90,
    )

    assert result == []


def test_map_history_route_returns_station_snapshot(monkeypatch):
    async def snapshot(_target_at, *, max_age_minutes):
        assert max_age_minutes == 90
        return [
            {
                "id": "a",
                "name_th": "A",
                "lat": 13.75,
                "lon": 100.5,
                "pm25": 18.5,
                "recorded_at": "2026-09-19T08:00:00+00:00",
                "data_status": "fresh",
                "age_minutes": 0,
                "eligible_for_surface": True,
                "in_service_area": True,
                "quality_flags": ["historical_reading"],
            }
        ]

    async def community(_target_at, _stations):
        return [], []

    monkeypatch.setattr(history, "get_map_history_community", community)
    monkeypatch.setattr(history, "get_map_history", snapshot)
    response = TestClient(create_app()).get(
        "/api/history/map",
        params={"at": (datetime.now(UTC) - timedelta(hours=1)).isoformat()},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert payload["stations"][0]["pm25"] == 18.5


def _report(**overrides):
    row = {
        "id": "history-report",
        "user_id": "user-a",
        "status": "approved",
        "lat": 13.75,
        "lon": 100.5,
        "pm25": 28.0,
        "captured_at": "2026-10-30T16:30:00Z",
        "created_at": "2026-10-30T16:30:00Z",
        "moderated_at": "2026-10-30T16:30:00Z",
        "trust_score": 20,
        "source_type": "individual",
        "gps_accuracy_m": 15,
        "show_reporter_profile": False,
    }
    return row | overrides


def test_reports_exist_from_publication_until_expiry_even_when_expired_today():
    from backend.algorithms.map_history import select_map_history_reports

    row = _report()
    for at, expected in [
        ("2026-10-30T16:29:59Z", False),
        ("2026-10-30T16:30:00Z", True),
        ("2026-10-30T19:29:59Z", True),
        ("2026-10-30T19:30:00Z", False),
    ]:
        selected = select_map_history_reports(
            [row], target_at=datetime.fromisoformat(at)
        )
        assert bool(selected) is expected


def test_history_excludes_future_publication_rejected_and_malformed_rows():
    from backend.algorithms.map_history import select_map_history_reports

    rows = [
        _report(status="pending"),
        _report(status="rejected"),
        _report(captured_at="broken"),
        _report(moderated_at="broken"),
        _report(created_at="2026-10-30T17:30:00Z"),
        _report(moderated_at="2026-10-30T17:30:00Z"),
        _report(pm25=None),
    ]
    assert (
        select_map_history_reports(
            rows, target_at=datetime(2026, 10, 30, 17, tzinfo=UTC)
        )
        == []
    )


def test_history_service_uses_selected_time_and_public_coordinates(monkeypatch):
    import asyncio

    from backend.services import map_history

    row = _report(public_lat=13.752, public_lon=100.502, ocr_pm25=28.0)
    target = datetime(2026, 10, 30, 17, tzinfo=UTC)
    monkeypatch.setattr(
        map_history.supabase_client, "get_map_history_reports", lambda at, ttl: [row]
    )
    monkeypatch.setattr(
        map_history.supabase_client, "signed_report_image_url", lambda _: None
    )
    reports, stacks = asyncio.run(map_history.get_map_history_community(target, []))
    assert len(reports) == 1
    assert reports[0]["is_fresh"] is True
    assert reports[0]["age_minutes"] == 30
    assert reports[0]["lat"] == 13.752
    assert reports[0]["lon"] == 100.502
    assert reports[0]["ocr_pm25"] is None
    assert reports[0]["gps_accuracy_m"] is None
    assert reports[0]["display_name"] is None
    assert reports[0]["pm25"] == 28.0
    assert stacks == []


def test_history_query_pages_beyond_default_report_and_database_limits(monkeypatch):
    from backend.services import supabase_client

    rows = [{"id": str(i)} for i in range(1005)]
    calls = []

    class Query:
        def __getattr__(self, name):
            def method(*args, **kwargs):
                calls.append((name, args))
                if name == "range":
                    self.start, self.end = args
                return self

            return method

        def execute(self):
            from types import SimpleNamespace

            return SimpleNamespace(data=rows[self.start : self.end + 1])

    monkeypatch.setattr(supabase_client.settings, "local_demo_mode", False)
    monkeypatch.setattr(supabase_client, "get_client", lambda: Query())
    result = supabase_client.get_map_history_reports(
        datetime(2026, 10, 30, 17, tzinfo=UTC)
    )
    assert len(result) == 1005
    assert [args for name, args in calls if name == "range"] == [(0, 999), (1000, 1999)]
    assert ("eq", ("status", "approved")) in calls
    assert ("gt", ("captured_at", "2026-10-30T14:00:00+00:00")) in calls


def test_http_history_includes_currently_expired_reports_at_their_valid_past_time(
    monkeypatch,
):
    from backend.services import map_history

    target = datetime.now(UTC) - timedelta(hours=8)
    captured = (target - timedelta(minutes=30)).isoformat()
    row = _report(
        captured_at=captured,
        created_at=captured,
        moderated_at=captured,
        public_lat=13.752,
        public_lon=100.502,
    )

    async def stations(*args, **kwargs):
        return []

    monkeypatch.setattr(history, "get_map_history", stations)
    monkeypatch.setattr(
        map_history.supabase_client, "get_map_history_reports", lambda *_: [row]
    )
    monkeypatch.setattr(
        map_history.supabase_client, "signed_report_image_url", lambda _: None
    )
    client = TestClient(create_app())
    body = client.get("/api/history/map", params={"at": target.isoformat()}).json()
    assert body["count"] == 0
    assert body["reports"][0]["pm25"] == 28
    assert body["reports"][0]["age_minutes"] == 30
    assert body["reports"][0]["lat"] == 13.752
    expired = client.get(
        "/api/history/map", params={"at": (target + timedelta(hours=3)).isoformat()}
    ).json()
    assert expired["reports"] == []
