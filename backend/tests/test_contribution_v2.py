from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import pytest

from backend.algorithms.contribution_v2 import (
    VERSION,
    contribution_awards,
    month_window,
)
from backend.algorithms.report_evidence import (
    evidence_gap_fill,
    history_summary,
    independent_evidence_sources,
    score_evidence,
)
from backend.core.config import settings
from backend.services.community import policy_v2, seasons, xp
from backend.tests.test_community_xp import report

LAUNCH = "2026-10-01T00:00:00Z"


@pytest.fixture
def v2(monkeypatch):
    monkeypatch.setattr(settings, "local_demo_mode", True)
    monkeypatch.setattr(settings, "community_v2_enabled", True)
    monkeypatch.setattr(settings, "community_v2_demo_launch", LAUNCH)
    monkeypatch.setattr(xp.db, "get_report_evidence", lambda _: {})
    xp._EVENTS.clear()
    xp._ACCOUNTS.clear()
    xp._CLAIMS.clear()
    policy_v2.DEMO_MISSIONS.clear()
    policy_v2.DEMO_OUTCOMES.clear()
    seasons._FROZEN.clear()
    yield
    xp._EVENTS.clear()
    xp._ACCOUNTS.clear()
    xp._CLAIMS.clear()
    policy_v2.DEMO_MISSIONS.clear()
    policy_v2.DEMO_OUTCOMES.clear()
    seasons._FROZEN.clear()


def settle(day=26, **values):
    time = f"2026-10-{day:02}T03:00:00Z"
    return report(
        id=f"report-{day}-{values.get('user_id', 'helper')}",
        created_at=time,
        captured_at=time,
        **values,
    )


def test_weekly_and_first_day_awards_are_retry_safe_and_use_server_time(v2):
    for day in [26, 27, 28, 29, 30]:
        row = settle(day)
        result = xp.reward_report(row)
        assert result["report_xp"] == 10 and result["first_day_xp"] == 5
    assert result["week_xp"] == 20
    assert xp.summary("helper")["lifetime_xp"] == 95
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: xp.reward_report(settle(30)), range(20)))
    assert all(r["week_xp"] == 20 for r in results)
    assert xp.summary("helper")["lifetime_xp"] == 95
    assert xp.board("2026-10", 0, "helper")["me"]["xp"] == 95
    assert xp.board("2026-11", 0, "helper")["me"]["xp"] == 0


def test_daily_caps_bonus_only_and_cooldown_ignore_first_week_events():
    start = datetime(2026, 10, 26, 3, tzinfo=UTC)
    events = []
    for i in range(7):
        t = (start + timedelta(minutes=30 * i)).isoformat()
        row = report(id=str(i), created_at=t, captured_at=t)
        awards = contribution_awards(
            row, events, service_eligible=True, launched_at=LAUNCH
        )
        events.extend(
            dict(
                a,
                id=f"{i}-{a['kind']}",
                report_id=str(i),
                user_id="helper",
                occurred_at=t,
                policy_version=VERSION,
            )
            for a in awards
        )
    assert sum(e["points"] for e in events) == 70
    assert sum(e["kind"] == "report" and e["points"] > 0 for e in events) == 5
    assert sum(e["kind"] == "help" for e in events) == 3
    assert sum(e["kind"] == "first_day" for e in events) == 1
    # Service quota may remain after base cap, so a bonus-only report is allowed.
    events = [e for e in events if e["kind"] != "help"]
    row = report(
        id="service-only",
        created_at=(start + timedelta(hours=4)).isoformat(),
        captured_at=(start + timedelta(hours=4)).isoformat(),
    )
    awards = contribution_awards(row, events, service_eligible=True, launched_at=LAUNCH)
    assert [(a["kind"], a["points"]) for a in awards] == [("report", 0), ("help", 5)]


def test_thai_month_midnight_and_t0():
    start, end = month_window("2026-12", datetime.now(UTC))
    assert start.astimezone(UTC).isoformat() == "2026-11-30T17:00:00+00:00"
    assert end.astimezone(UTC).isoformat() == "2026-12-31T17:00:00+00:00"
    assert (
        contribution_awards(
            settle(1), [], service_eligible=True, launched_at="2026-10-02T00:00:00Z"
        )
        == []
    )


def test_new_month_ties_keep_old_points_and_hidden_own_total(v2):
    xp._EVENTS.append(
        dict(
            id="old",
            user_id="helper",
            kind="report",
            points=100,
            occurred_at="2026-09-01T00:00:00Z",
            recorded_at=LAUNCH,
            policy_version="xp-v1",
        )
    )
    xp.reward_report(settle(26))
    xp.reward_report(settle(26, user_id="other"))
    board = xp.board("2026-10", 0, "helper")
    assert [r["rank"] for r in board["users"]] == [1, 1]
    assert board["me"]["xp"] == 15 and board["me"]["lifetime_xp"] == 115
    xp.update_settings("helper", dict(alias="สายลม", hidden=True))
    own = xp.board("2026-10", 0, "helper")["me"]
    assert own["rank"] is None and own["xp"] == 15
    assert all("user_id" not in row for row in board["users"])


def evidence_row(**changes):
    return report(
        id="target",
        created_at="2026-11-05T03:00:00Z",
        captured_at="2026-11-05T03:00:00Z",
        ocr_pm25=22,
        gps_accuracy_m=20,
        measurement_environment="outdoor",
        averaging_period="instant",
        measurement_source_key="independent-device-a",
        **changes,
    )


FACTS = dict(
    pm25_field_verified=True,
    unit_verified=True,
    capture_provenance_verified=True,
    location_time_verified=True,
    context_recorded=True,
)
NOW = datetime(2026, 11, 5, 3, 10, tzinfo=UTC)


def test_evidence_unknown_fields_keep_full_denominator_and_block_analytics():
    r = evidence_row()
    complete = score_evidence(r, FACTS)
    assert complete["score"] == 100 and not complete["blockers"]
    partial = score_evidence(r, FACTS | dict(unit_verified=None))
    assert partial["score"] == 90 and "unit_verified" in partial["blockers"]
    assert not evidence_gap_fill(
        r, partial, now=NOW, official_nearby=False, independent_sources=2, threshold=70
    )["eligible"]
    assert not evidence_gap_fill(
        r,
        complete,
        now=NOW,
        official_nearby=False,
        independent_sources=2,
        threshold=None,
    )["eligible"]
    assert (
        score_evidence(
            r
            | dict(
                device_calibrated=True,
                trust_score=100,
                reputation_score=10000,
                like_count=1000,
            ),
            FACTS,
        )
        == complete
    )


def test_independence_needs_verified_sources_and_current_support():
    r = evidence_row()
    r["evidence_v2"] = score_evidence(r, FACTS)
    peer = r | dict(
        id="peer", user_id="peer", measurement_source_key="independent-device-b"
    )
    assert independent_evidence_sources(r, [peer], now=NOW, threshold=70) == 2
    assert (
        independent_evidence_sources(
            r,
            [peer | dict(measurement_source_key="independent-device-a")],
            now=NOW,
            threshold=70,
        )
        == 1
    )
    assert (
        independent_evidence_sources(
            r, [peer | dict(measurement_source_key=None)], now=NOW, threshold=70
        )
        == 1
    )
    assert (
        independent_evidence_sources(
            r, [peer | dict(near_emission_source=True)], now=NOW, threshold=70
        )
        == 1
    )
    assert (
        independent_evidence_sources(
            r, [peer], now=NOW + timedelta(hours=4), threshold=70
        )
        == 0
    )
    assert not evidence_gap_fill(
        r,
        r["evidence_v2"],
        now=NOW,
        official_nearby=True,
        independent_sources=2,
        threshold=70,
    )["eligible"]


def test_history_is_not_ocr_approval_or_a_manufactured_user_trust():
    assert history_summary([])["pass_rate"] is None
    result = history_summary(
        [dict(outcome="pass"), dict(outcome="problem"), dict(outcome="unresolved")]
    )
    assert result["evaluated"] == 2 and result["pass_rate"] == 50


def test_compensation_reverses_dependent_bonuses_once_and_revises_season(v2):
    from backend.services.community.compensation import reconcile_demo

    for day in [26, 27, 28, 29, 30]:
        xp.reward_report(settle(day))
    initial = xp.board("2026-10", 0, "helper")
    assert initial["revision"] == 1 and not initial["provisional"]
    policy_v2.DEMO_OUTCOMES.append(
        dict(
            report_id=settle(26)["id"],
            user_id="helper",
            scope="metadata",
            outcome="problem",
            invalidates_contribution=True,
        )
    )
    reconcile_demo()
    reconcile_demo()
    assert xp.summary("helper")["lifetime_xp"] == 60
    revised = xp.board("2026-10", 0, "helper")
    assert revised["revision"] == 2 and revised["me"]["xp"] == 60
    assert len(seasons._FROZEN["2026-10"]["previous_results"]) == 1


def test_coverage_missions_are_preannounced_bounded_and_do_not_reveal_saved_addresses(
    v2, monkeypatch
):
    from backend.algorithms.coverage_missions import missing_coverage
    from backend.services.community import missions

    now = datetime.now(UTC)
    monkeypatch.setattr(missions, "_LAST_CHECK", None)
    monkeypatch.setattr(missions.db, "get_stations", lambda: [])
    monkeypatch.setattr(missions.db, "list_community_reports", lambda *_: [])
    assert missions.refresh() == len(missions.CENTRES)
    assert missions.refresh() == 0
    public = missions.available()
    assert len(public) == 3
    assert all(
        "inputs" not in row and "user_id" not in row and "area_key" not in row
        for row in public
    )
    assert not missing_coverage(
        14, 100, [dict(lat=14, lon=100, pm25=5, recorded_at=now.isoformat())], [], now
    )
    assert missing_coverage(
        14,
        100,
        [
            dict(
                lat=14,
                lon=100,
                pm25=5,
                recorded_at=(now - timedelta(hours=2)).isoformat(),
            )
        ],
        [],
        now,
    )


def test_independent_import_is_scoped_idempotent_and_does_not_invent_calibration(v2):
    from backend.services import local_store
    from backend.services.community.evaluation_ingest import (
        IndependentEvaluation,
        ingest,
    )

    r = evidence_row()
    r["evidence_v2"] = score_evidence(r, FACTS)
    local_store.insert_report(r)
    value = dict(
        evaluation_key="controlled-independent-fixture",
        user_id=r["user_id"],
        report_id=r["id"],
        scope="field_protocol",
        outcome="pass",
        provenance="independent-fixture-protocol",
        evaluated_at=NOW.isoformat(),
        source_key="private-independent-fixture",
    )
    ingest(value)
    ingest(value)
    assert policy_v2.outcomes(r["user_id"])["evaluated"] == 1
    stored = local_store.get_report(r["id"])
    assert stored["measurement_source_key"] == "private-independent-fixture"
    assert stored["evidence_v2"]["device_status"] == "unknown"
    with pytest.raises(ValueError):
        IndependentEvaluation.model_validate(value | dict(scope="image"))
    with pytest.raises(ValueError):
        IndependentEvaluation.model_validate(
            value | dict(invalidates_contribution=True)
        )


def test_offline_evaluation_rejects_split_leakage_and_labels_evidence_only():
    from scripts.community_evidence import evaluate

    base = dict(
        report=evidence_row(),
        facts=FACTS,
        label_provenance="synthetic-adversarial-fixture-not-a-field-trial",
        expected_evidence_sufficient=True,
        subject_group="test-user",
        device_group="test-device",
        session_group="test-session",
        split="test",
    )
    output = evaluate(
        [
            base,
            base
            | dict(
                facts=FACTS | dict(unit_verified=False),
                expected_evidence_sufficient=False,
            ),
        ],
        70,
    )
    assert output["false_inclusions"] == 0 and output["false_exclusions"] == 0
    assert output["held_out_count"] == 2
    assert "not_sensor_accuracy" in output["scope"]
    with pytest.raises(ValueError, match="leakage"):
        evaluate([base, base | dict(split="train")], 70)
