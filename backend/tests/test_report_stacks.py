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


def test_each_eligible_report_contributes_even_from_the_same_account():
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
    assert group["pm25"] == 21.3
    assert group["contributing_count"] == 3
    assert set(group["contributing_report_ids"]) == {"old", "new", "bob"}


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


def test_map_visible_reports_older_than_sixty_minutes_are_averaged():
    rows = [
        report(
            "a", "alice", 20, captured_at=(NOW - timedelta(minutes=120)).isoformat()
        ),
        report("b", "bob", 24, captured_at=(NOW - timedelta(minutes=130)).isoformat()),
    ]
    group = group_report_stacks(rows, now=NOW)[0]
    assert group["value_status"] == "average"
    assert group["pm25"] == 22
    assert group["report_count"] == 2


def test_different_readings_are_included_without_a_compatibility_gate():
    group = group_report_stacks(
        [report("a", "alice", 20), report("b", "bob", 70)], now=NOW
    )[0]
    assert group["value_status"] == "average"
    assert group["pm25"] == 45


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


def test_repeat_reports_are_labelled_as_a_report_average_not_an_area_average():
    rows = [
        report("a", "alice", 20, captured_at=(NOW - timedelta(minutes=25)).isoformat()),
        report("b", "alice", 22),
    ]
    group = group_report_stacks(rows, now=NOW)[0]
    assert group["value_status"] == "average"
    assert group["pm25"] == 21
    assert group["reporter_count"] == 1
    assert group["contributing_count"] == 2


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


def test_audit_metadata_does_not_gate_the_group_mean():
    rows = [
        report(
            "a",
            "alice",
            10,
            measurement_stable=False,
            measurement_environment="indoor",
            near_emission_source=True,
            duplicate_of_report_id="audit-reference",
        ),
        report("b", "bob", 34, measurement_stable=False),
    ]
    group = group_report_stacks(rows, now=NOW)[0]
    assert group["pm25"] == 22
    assert group["value_status"] == "average"
    assert set(group["contributing_report_ids"]) == {"a", "b"}


def test_gps_threshold_is_inclusive_and_excludes_only_the_inaccurate_reading():
    rows = [
        report("a", "alice", 10, gps_accuracy_m=50),
        report("b", "bob", 34, gps_accuracy_m=50.01),
    ]
    group = group_report_stacks(rows, now=NOW)[0]
    assert group["value_status"] == "single"
    assert group["pm25"] == 10
    assert group["contributing_report_ids"] == ["a"]
    assert group["report_count"] == 2


def test_map_publication_and_three_hour_lifetime_still_apply():
    rows = [
        report("a", "alice", 10),
        report("b", "bob", 34),
        report(
            "old", "other", 500, captured_at=(NOW - timedelta(minutes=181)).isoformat()
        ),
        report("rejected", "rejected", 800, status="rejected"),
    ]
    group = group_report_stacks(rows, now=NOW)[0]
    assert group["report_count"] == 2
    assert group["pm25"] == 22
