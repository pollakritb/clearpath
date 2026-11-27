"""Own reports are excluded from current nearby alerts; v2 checks are historical."""

from datetime import UTC, datetime, timedelta

from backend.algorithms.nearby_air_alert import alert_sources
from backend.algorithms.nearest_air_alert import transition
from backend.services import air_alerts


def test_self_report_38_is_removed_before_other_report_55_is_selected(monkeypatch):
    now = datetime.now(UTC)
    point = {
        "user_id": "owner",
        "lat": 14,
        "lon": 100,
        "accuracy_m": 10,
        "observed_at": now.isoformat(),
        "version": "v",
    }
    monkeypatch.setattr(air_alerts.settings, "local_demo_mode", True)
    monkeypatch.setattr(air_alerts.supabase_client, "get_stations", lambda: [])
    monkeypatch.setattr(
        air_alerts.local_store,
        "list_reports",
        lambda *_: [
            {
                "id": "own",
                "user_id": "owner",
                "status": "approved",
                "pm25": 38,
                "public_lat": 14.0001,
                "public_lon": 100,
                "captured_at": now.isoformat(),
            },
            {
                "id": "other",
                "user_id": "someone-else",
                "status": "approved",
                "pm25": 55,
                "public_lat": 14.002,
                "public_lon": 100,
                "captured_at": now.isoformat(),
            },
        ],
    )
    picked = alert_sources(point, air_alerts.candidates(point, 2), {}, now)
    assert [(row["source_id"], row["pm25"]) for row in picked] == [("other", 55)]


def test_historical_v2_aggregates_many_reports_into_one_daily_band():
    now = datetime.now(UTC)
    state = {}
    emitted = 0
    for i in range(20):
        state = transition(
            state,
            {"source_id": str(i), "pm25": 55 + i / 10},
            37.6,
            now + timedelta(seconds=i),
        )
        emitted += int(state.pop("notify"))
    assert emitted == 1
    assert transition(state, {"pm25": 76}, 37.6, now + timedelta(minutes=1))["notify"]


def test_line_notice_has_clear_value_threshold_source_distance_and_time():
    now = datetime.now(UTC)
    notice = air_alerts.notice_for(
        {
            "source_type": "community",
            "source_id": "20",
            "source_at": now.isoformat(),
            "pm25": 55,
            "distance_km": 0.23,
        },
        {"version": "v"},
        {"pm25_threshold": 37.6},
        "key",
    )
    assert "55 µg/m³" in notice["title"]
    assert "37.6–75.0 µg/m³" in notice["body"]
    assert "230 เมตร" in notice["body"]
    assert "แหล่งข้อมูล: รายงานชุมชน" in notice["body"]
    assert "\n\nคำแนะนำ:" in notice["body"]
    assert "เวลาไทย" in notice["body"]
