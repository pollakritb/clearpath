from datetime import UTC, datetime, timedelta

from backend.algorithms.report_stacks import group_report_stacks
from backend.services.community import presenter

NOW = datetime(2026, 10, 10, 10, 0, tzinfo=UTC)


def report(report_id: str, user_id: str, pm25: float, **overrides) -> dict:
    return {
        "id": report_id,
        "user_id": user_id,
        "status": "approved",
        "source_type": "individual",
        "lat": 13.82,
        "lon": 100.06,
        "pm25": pm25,
        "gps_accuracy_m": 30,
        "captured_at": (NOW - timedelta(minutes=10)).isoformat(),
        **overrides,
    }


def test_two_nearby_users_get_one_average():
    rows = [report("a", "alice", 20), report("b", "bob", 24)]
    groups = group_report_stacks(rows, now=NOW)
    assert len(groups) == 1
    assert groups[0]["pm25"] == 22
    assert groups[0]["value_status"] == "average"
    assert groups[0]["reporter_count"] == 2
    assert "lat" not in groups[0] and "lon" not in groups[0]


def test_repeat_reporter_only_contributes_latest_reading():
    rows = [
        report(
            "old", "alice", 18, captured_at=(NOW - timedelta(minutes=40)).isoformat()
        ),
        report("new", "alice", 22),
        report("bob", "bob", 24),
    ]
    group = group_report_stacks(rows, now=NOW)[0]
    assert group["report_count"] == 3
    assert group["reporter_count"] == 2
    assert group["report_ids"][0] in {"new", "bob"}
    assert group["pm25"] == 23
    assert group["contributing_count"] == 2
    assert set(group["contributing_report_ids"]) == {"new", "bob"}


def test_distance_accounts_for_both_gps_accuracy_radii():
    # About 245 m apart; adding both 30 m accuracy radii exceeds 300 m.
    rows = [report("a", "alice", 20), report("b", "bob", 22, lat=13.8222)]
    assert group_report_stacks(rows, now=NOW) == []
    rows[1]["lat"] = 13.8215  # About 167 m + 60 m uncertainty.
    assert len(group_report_stacks(rows, now=NOW)) == 1


def test_no_chained_groups_beyond_pairwise_limit():
    rows = [
        report("a", "a", 20, lat=13.82),
        report("b", "b", 22, lat=13.8215),
        report("c", "c", 23, lat=13.823),
    ]
    groups = group_report_stacks(rows, now=NOW)
    assert len(groups) == 1
    assert groups[0]["report_count"] == 2


def test_older_reports_remain_listed_but_not_averaged():
    rows = [
        report(
            "a", "alice", 20, captured_at=(NOW - timedelta(minutes=120)).isoformat()
        ),
        report("b", "bob", 24, captured_at=(NOW - timedelta(minutes=130)).isoformat()),
    ]
    group = group_report_stacks(rows, now=NOW)[0]
    assert group["value_status"] == "older"
    assert group["pm25"] is None
    assert group["report_count"] == 2


def test_disagreeing_readings_have_no_misleading_average():
    group = group_report_stacks(
        [report("a", "alice", 20), report("b", "bob", 70)], now=NOW
    )[0]
    assert group["value_status"] == "mixed"
    assert group["pm25"] is None


def test_poor_accuracy_can_stack_visually_but_not_affect_average():
    group = group_report_stacks(
        [
            report("a", "alice", 20, gps_accuracy_m=100),
            report("b", "bob", 24, gps_accuracy_m=100),
        ],
        now=NOW,
    )[0]
    assert group["report_count"] == 2
    assert group["value_status"] == "older"


def test_one_user_never_claims_area_average():
    rows = [
        report("a", "alice", 20, captured_at=(NOW - timedelta(minutes=25)).isoformat()),
        report("b", "alice", 22),
    ]
    group = group_report_stacks(rows, now=NOW)[0]
    assert group["value_status"] == "single"
    assert group["pm25"] == 22
    assert group["reporter_count"] == 1


def test_public_stack_uses_only_obfuscated_report_coordinates(monkeypatch):
    rows = [report("a", "alice", 20), report("b", "bob", 24)]
    for row in rows:
        row["captured_at"] = datetime.now(UTC).isoformat()
    monkeypatch.setattr(
        presenter.supabase_client, "list_community_reports", lambda *_: rows
    )
    monkeypatch.setattr(presenter.supabase_client, "get_stations", lambda: [])
    monkeypatch.setattr(
        presenter,
        "present_report",
        lambda row, **_kwargs: {
            "id": row["id"],
            "lat": row["lat"] + 0.002,
            "lon": row["lon"] + 0.002,
            "is_fresh": True,
        },
    )
    public_reports, stacks = presenter.list_public_map_reports()
    assert len(public_reports) == 2
    assert len(stacks) == 1
    assert round(stacks[0]["lat"], 3) == 13.822
    assert round(stacks[0]["lon"], 3) == 100.062
