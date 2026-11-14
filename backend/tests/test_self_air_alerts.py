"""Own reports cannot mask another user's warning or consume its episode."""

from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest

from backend.algorithms.nearest_air_alert import nearest_source, transition
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
    picked = nearest_source(point, air_alerts.candidates(point, 10), 10, now)
    assert picked["source_id"] == "other" and picked["pm25"] == 55
    assert transition({}, picked, 37.6, now)["notify"]


@pytest.mark.parametrize("was_own", [True, False])
def test_episode_repair_is_evidence_bound_and_does_not_reset_valid_alerts(
    monkeypatch, was_own
):
    now = datetime.now(UTC)
    old = {"severity": 1, "last_notified_at": now.isoformat(), "audit_marker": "keep"}
    calls = []

    class Client:
        def rpc(self, name, params):
            calls.append((name, params))
            return SimpleNamespace(execute=lambda: SimpleNamespace(data=was_own))

    monkeypatch.setattr(air_alerts.settings, "local_demo_mode", False)
    monkeypatch.setattr(air_alerts.db, "get_client", lambda: Client())
    repaired = air_alerts.episode_for_other_reports("USR-000005", old)
    notice = transition(repaired, {"pm25": 55}, 37.6, now)
    assert notice["notify"] is was_own
    assert repaired["audit_marker"] == "keep" and old["severity"] == 1
    assert len(calls) == 1
    air_alerts.episode_for_other_reports("USR-000005", repaired)
    assert len(calls) == 1  # The policy upgrade does not add a read per worker poll.


def test_many_other_reports_do_not_generate_a_message_per_report():
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
    assert "37.6 µg/m³ ขึ้นไป" in notice["body"]
    assert "230 เมตร" in notice["body"]
    assert "แหล่งข้อมูล: รายงานชุมชน" in notice["body"]
    assert "\n\nคำแนะนำ:" in notice["body"]
    assert "เวลาไทย" in notice["body"]
