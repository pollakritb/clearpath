from datetime import UTC, datetime, timedelta

import pytest

from backend.algorithms.contribution_v3 import contribution_awards, service_eligibility
from backend.algorithms.coverage_missions import missing_coverage
from backend.tests.test_community_xp import report

LAUNCH = "2026-10-01T00:00:00+07:00"
START = datetime(2026, 10, 26, 3, tzinfo=UTC)


def awards_for(i, events, *, service=True, **kwargs):
    t = (START + timedelta(minutes=30 * i)).isoformat()
    row = report(id=f"r{i}", created_at=t, captured_at=t, **kwargs)
    rows = contribution_awards(
        row, events, service_eligible=service, launched_at=LAUNCH
    )
    return [
        a
        | dict(
            id=f"r{i}:{a['kind']}",
            user_id="helper",
            report_id=row["id"],
            occurred_at=t,
            policy_version="contribution-v3",
        )
        for a in rows
    ]


def test_daily_seventy_bonus_only_retry_and_cross_version_cooldown():
    events = []
    for i in range(8):
        events.extend(awards_for(i, events))
    assert sum(e["points"] for e in events) == 70
    assert len([e for e in events if e["kind"] == "help"]) == 3
    assert awards_for(0, events) == []
    base_only = [e for e in events if e["kind"] != "help"]
    rows = awards_for(8, base_only)
    assert [(e["kind"], e["points"]) for e in rows] == [("report", 0), ("help", 5)]
    # Legacy/reversed grants still consume quota and cooldown.
    legacy = [e | {"policy_version": "xp-v1"} for e in events]
    assert awards_for(9, legacy)[0]["points"] == 0
    at = (START + timedelta(minutes=29, seconds=59)).isoformat()
    row = report(id="early", created_at=at, captured_at=at)
    assert (
        contribution_awards(row, legacy[:1], service_eligible=True, launched_at=LAUNCH)[
            0
        ]["reason"]
        == "cooldown"
    )


def test_cross_month_five_days_nonconsecutive_and_shared_week_key():
    events = []
    for day in [26, 27, 29, 30, 31]:
        t = f"2026-10-{day}T03:00:00Z"
        row = report(id=f"day{day}", created_at=t, captured_at=t)
        rows = contribution_awards(
            row, events, service_eligible=False, launched_at=LAUNCH
        )
        events += [
            e
            | dict(
                id=f"{day}{e['kind']}",
                user_id="helper",
                report_id=row["id"],
                occurred_at=t,
                policy_version="contribution-v2" if day < 29 else "contribution-v3",
            )
            for e in rows
        ]
    assert sum(e["kind"] == "contribution_week" for e in events) == 1
    t = "2026-11-01T03:00:00Z"
    rows = contribution_awards(
        report(id="sun", created_at=t, captured_at=t),
        events,
        service_eligible=True,
        launched_at=LAUNCH,
    )
    assert not any(e["kind"] == "contribution_week" for e in rows)


@pytest.mark.parametrize("value", [0, 1, 200, 999])
def test_severity_does_not_increase_awards(value):
    assert sum(e["points"] for e in awards_for(0, [], service=False, pm25=value)) == 15


@pytest.mark.parametrize("value", [-1, float("nan"), float("inf"), True, None])
def test_invalid_pm25_gets_no_points(value):
    assert sum(e["points"] for e in awards_for(0, [], pm25=value)) == 0


def test_service_has_stricter_evidence_without_changing_base_publication():
    t = START.isoformat()
    r = report(created_at=t, captured_at=t, lat=14, lon=100)
    q = dict(
        user_id="requester",
        starts_at=(START - timedelta(minutes=2)).isoformat(),
        expires_at=(START + timedelta(minutes=15)).isoformat(),
        lat=14,
        lon=100,
        radius_km=2,
        status="active",
    )
    metadata = {"bonus_gps_at_submission": {"lat": 14, "lon": 100, "accuracy_m": 20}}
    assert service_eligibility(r, q, None, metadata, automatic=True) == "granted"
    for accuracy in [None, -1, float("nan"), float("inf"), 201]:
        m = {"bonus_gps_at_submission": {"lat": 14, "lon": 100, "accuracy_m": accuracy}}
        assert service_eligibility(r, q, None, m, automatic=True) == "invalid_evidence"
    assert (
        service_eligibility(
            r, q | {"user_id": "helper"}, None, metadata, automatic=True
        )
        != "granted"
    )
    assert (
        service_eligibility(
            r | {"clock_warning": True}, q, None, metadata, automatic=True
        )
        != "granted"
    )


def test_v3_missing_coverage_searches_two_km_not_legacy_five():
    station = {"lat": 14.03, "lon": 100, "pm25": 20, "recorded_at": START.isoformat()}
    assert missing_coverage(14, 100, [station], [], START, station_radius_km=2)
    assert not missing_coverage(14, 100, [station], [], START)


def test_dependent_bonus_reversal_restoration_never_refunds_quota():
    from backend.algorithms.contribution_v3 import dependent_bonus_actions

    events = awards_for(0, [], service=False)
    base = next(e for e in events if e["kind"] == "report")
    events.append(
        dict(
            id="reverse",
            kind="reversal",
            points=-10,
            user_id="helper",
            reverses=base["id"],
            occurred_at=base["occurred_at"],
        )
    )
    actions = dependent_bonus_actions(events)
    assert actions == [{"action": "reverse", "event_id": "r0:first_day"}]
    events.append(
        dict(
            id="reverse-first",
            kind="reversal",
            points=-5,
            user_id="helper",
            reverses="r0:first_day",
            occurred_at=base["occurred_at"],
        )
    )
    events.extend(awards_for(1, events, service=False))
    restored = dependent_bonus_actions(events)
    assert (
        len(restored) == 1
        and restored[0]["kind"] == "first_day"
        and restored[0]["report_id"] == "r1"
    )
    events.append(
        {k: v for k, v in restored[0].items() if k != "action"} | {"id": "restored"}
    )
    assert dependent_bonus_actions(events) == []


def test_fifth_day_can_reach_ninety_without_sixth_day_repeating_week_bonus():
    prior = []
    for day in [26, 27, 28, 29]:
        t = f"2026-10-{day}T03:00:00Z"
        prior.append(
            dict(
                id=f"old{day}",
                user_id="helper",
                kind="report",
                points=10,
                report_id=f"old{day}",
                occurred_at=t,
                policy_version="contribution-v2",
            )
        )
    friday = []
    for i in range(5):
        t = (
            datetime(2026, 10, 30, 3, tzinfo=UTC) + timedelta(minutes=30 * i)
        ).isoformat()
        rows = contribution_awards(
            report(id=f"fri{i}", created_at=t, captured_at=t),
            prior + friday,
            service_eligible=True,
            launched_at=LAUNCH,
        )
        friday += [
            e
            | dict(
                id=f"fri{i}:{e['kind']}",
                user_id="helper",
                report_id=f"fri{i}",
                occurred_at=t,
                policy_version="contribution-v3",
            )
            for e in rows
        ]
    assert sum(e["points"] for e in friday) == 90
    assert sum(e["kind"] == "contribution_week" for e in friday) == 1


def test_demo_v3_preserves_balance_and_assigns_report_policy_by_server_submission(
    monkeypatch,
):
    from backend.core.config import settings
    from backend.services.community import policy_v2, policy_v3, xp

    monkeypatch.setattr(settings, "local_demo_mode", True)
    monkeypatch.setattr(settings, "contribution_v3_enabled", True)
    monkeypatch.setattr(settings, "contribution_v3_demo_start", LAUNCH)
    monkeypatch.setattr(settings, "community_v2_enabled", False)
    monkeypatch.setattr(xp, "_EVENTS", [])
    monkeypatch.setattr(xp, "_ACCOUNTS", {})
    monkeypatch.setattr(xp, "_CLAIMS", {})
    monkeypatch.setattr(policy_v2, "DEMO_MISSIONS", {})
    monkeypatch.setattr(xp.db, "get_report_evidence", lambda _: {})
    old = report(
        id="old-policy",
        created_at="2026-09-29T03:00:00Z",
        captured_at="2026-09-29T03:00:00Z",
        moderated_at="2026-09-29T03:00:00Z",
    )
    assert xp.reward_report(old)["policy_version"] == "xp-v1"
    new = report(
        id="new-policy",
        created_at="2026-10-26T03:00:00Z",
        captured_at="2026-10-26T03:00:00Z",
    )
    result = xp.reward_report(new)
    assert (
        result["policy_version"] == "contribution-v3"
        and result["report_xp"] == 10
        and result["first_day_xp"] == 5
    )
    assert xp.totals("helper")["lifetime_xp"] == 25
    assert xp.reward_report(new) == result
    assert xp.totals("helper")["lifetime_xp"] == 25
    assert policy_v3.applies(new) and not policy_v3.applies(old)


def test_v3_coverage_uses_service_provenance_not_retired_ocr_field_flags():
    row = report(
        created_at=START.isoformat(),
        captured_at=START.isoformat(),
        lat=14,
        lon=100,
        measurement_environment="outdoor",
        gps_accuracy_m=20,
        near_emission_source=False,
    )
    assert not missing_coverage(
        14, 100, [], [row], START, station_radius_km=2, require_evidence_v2=False
    )
    assert missing_coverage(14, 100, [], [row], START)
    for changed in [
        {"clock_warning": True},
        {"status": "rejected"},
        {"near_emission_source": True},
        {"capture_source": None},
    ]:
        assert missing_coverage(
            14,
            100,
            [],
            [row | changed],
            START,
            station_radius_km=2,
            require_evidence_v2=False,
        )
