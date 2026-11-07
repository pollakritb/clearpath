import math
from datetime import UTC, datetime, timedelta

from backend.algorithms.community_trust import project, vote_eligibility

NOW = datetime(2026, 11, 7, 6, tzinfo=UTC)


def event(seq, day, voter, report=None, reaction="like", **changes):
    return (
        dict(
            seq=seq,
            action="set",
            vote_day=day,
            voter_id=voter,
            reporter_id="author",
            report_id=report or f"r{seq}",
            reaction=reaction,
            eligible=True,
            payload={},
            created_at=f"{day}T03:00:00Z",
        )
        | changes
    )


def test_empty_insufficient_and_three_day_formula():
    assert project([], now=NOW)["score"] is None
    assert project([event(1, "2026-11-07", "a")], now=NOW)["status"] == "insufficient"
    events = [
        event(1, "2026-11-05", "a"),
        event(2, "2026-11-05", "b"),
        event(3, "2026-11-05", "c"),
        event(4, "2026-11-06", "a"),
        event(5, "2026-11-06", "b"),
        event(6, "2026-11-06", "c", reaction="dislike"),
        event(7, "2026-11-06", "d", reaction="dislike"),
        event(8, "2026-11-07", "e"),
    ]
    value = project(events, now=NOW)
    assert value["status"] == "available"
    assert round(value["score"], 1) == 78.6
    assert value["score"] == 550 / 7
    assert value["effective_day_weight"] == 7
    assert value["comparison"]["raw"] == 75


def test_all_positive_negative_and_daily_weight_cap():
    events = [
        event(1, "2026-11-05", "a"),
        event(2, "2026-11-06", "b"),
        event(3, "2026-11-07", "c"),
    ]
    assert project(events, now=NOW)["score"] == 100
    assert project([e | {"reaction": "dislike"} for e in events], now=NOW)["score"] == 0
    bulk = [event(i, "2026-11-07", str(i)) for i in range(1, 301)]
    assert project(bulk, now=NOW)["daily"][0]["weight"] == 3
    assert project(bulk[:3], now=NOW)["daily"][0]["weight"] == 3


def test_representative_withdrawal_does_not_restore_old_report_and_nonrepresentative_has_no_effect():
    a = event(1, "2026-11-07", "a", "old")
    b = event(2, "2026-11-07", "a", "new", reaction="dislike")
    withdraw = event(3, "2026-11-07", "a", "old", action="withdraw", eligible=False)
    assert project([a, b, withdraw], now=NOW)["daily"][0]["negative"] == 1
    assert project([a, b, withdraw | {"report_id": "new"}], now=NOW)["daily"] == []


def test_hold_release_and_withdrawal_during_hold():
    base = event(1, "2026-11-07", "a")
    hold = event(
        2,
        "2026-11-07",
        "a",
        action="hold",
        payload={
            "target_sequences": [1],
            "until": (NOW + timedelta(minutes=30)).isoformat(),
        },
    )
    assert project([base, hold], now=NOW)["status"] == "updating"
    assert (
        project([base, hold], now=NOW + timedelta(minutes=31))["evaluated_report_count"]
        == 1
    )
    withdrawal = event(
        3, "2026-11-07", "a", base["report_id"], action="withdraw", eligible=False
    )
    assert (
        project([base, hold, withdrawal], now=NOW + timedelta(minutes=31))[
            "evaluated_report_count"
        ]
        == 0
    )
    extension = hold | {
        "seq": 4,
        "payload": {
            "target_sequences": [1],
            "until": (NOW + timedelta(hours=2)).isoformat(),
        },
    }
    assert (
        project([base, hold, extension], now=NOW + timedelta(minutes=31))[
            "evaluated_report_count"
        ]
        == 1
    )


def test_invalidated_vote_replays_remaining_events_and_rejected_attempt_preserves_previous_vote():
    old = event(1, "2026-11-07", "a", "old")
    new = event(2, "2026-11-07", "a", "new", reaction="dislike")
    finding = event(
        3,
        "2026-11-07",
        "a",
        action="finding",
        payload={"target_sequences": [2], "outcome": "invalid"},
    )
    assert project([old, new, finding], now=NOW)["daily"][0]["positive"] == 1
    rejected = new | {"payload": {"accepted": False}, "eligible": False}
    assert project([old, rejected], now=NOW)["daily"][0]["positive"] == 1


def test_window_uses_ninety_thai_calendar_days_and_returns_insufficient_on_expiry():
    today = NOW.astimezone(__import__("zoneinfo").ZoneInfo("Asia/Bangkok")).date()
    start = today - timedelta(days=89)
    events = [
        event(1, str(start), "a"),
        event(2, str(today - timedelta(days=1)), "b"),
        event(3, str(today), "c"),
    ]
    assert project(events, now=NOW)["status"] == "available"
    assert project(events, now=NOW + timedelta(days=1))["status"] == "insufficient"
    assert project(events, now=NOW)["window_start"] == str(start)


def test_gps_two_minutes_boundary_and_audit_never_contains_coordinates():
    report = {
        "user_id": "owner",
        "status": "approved",
        "captured_at": NOW.isoformat(),
        "lat": 13.8,
        "lon": 100.1,
    }
    fix = {
        "lat": 13.8,
        "lon": 100.1,
        "accuracy_m": 500,
        "observed_at": (NOW - timedelta(seconds=120)).isoformat(),
    }
    reason, audit = vote_eligibility(
        report, "voter", fix, "like", "useful", now=NOW, evidence_available=True
    )
    assert reason is None
    assert "lat" not in audit and "lon" not in audit
    assert (
        vote_eligibility(
            report,
            "voter",
            fix | {"accuracy_m": 500.1},
            "like",
            "useful",
            now=NOW,
            evidence_available=True,
        )[0]
        == "gps_uncertain"
    )
    assert (
        vote_eligibility(
            report,
            "voter",
            fix | {"accuracy_m": math.nan},
            "like",
            "useful",
            now=NOW,
            evidence_available=True,
        )[0]
        == "gps_invalid"
    )
    assert (
        vote_eligibility(
            report,
            "voter",
            fix | {"observed_at": (NOW - timedelta(seconds=121)).isoformat()},
            "like",
            "useful",
            now=NOW,
            evidence_available=True,
        )[0]
        == "gps_expired"
    )
    assert (
        vote_eligibility(
            report, "owner", fix, "like", "useful", now=NOW, evidence_available=True
        )[0]
        == "self_vote"
    )
    assert (
        vote_eligibility(
            report,
            "voter",
            fix,
            "dislike",
            "ocr_mismatch",
            now=NOW,
            evidence_available=True,
        )[0]
        == "reason_not_trust"
    )
    assert (
        vote_eligibility(
            report, "voter", fix, "like", "useful", now=NOW, evidence_available=False
        )[0]
        == "evidence_unavailable"
    )


def test_projection_failure_returns_dated_previous_value_without_zero(monkeypatch):
    from backend.core.errors import UpstreamError
    from backend.services.community import community_trust as service

    monkeypatch.setattr(service.settings, "community_trust_collection_enabled", True)
    monkeypatch.setattr(service, "control", lambda: {"collecting_enabled": True})
    previous = {
        "score": 78.6,
        "status": "available",
        "calculated_at": "2026-11-06T00:00:00Z",
    }

    def fake_rpc(name, params=None):
        if name == "community_trust_snapshot":
            return {"events": [], "ledger_seq": 4, "projection": previous}
        raise UpstreamError("test unavailable")

    monkeypatch.setattr(service, "rpc", fake_rpc)
    value = service.summary("owner", owner=True)
    assert value["status"] == "updating" and value["score"] == 78.6
    assert value["calculated_at"] == previous["calculated_at"]


def test_public_summary_and_private_report_are_hidden_when_public_flag_off(monkeypatch):
    from backend.services.community import community_trust as service

    monkeypatch.setattr(service.settings, "community_trust_public_enabled", False)
    monkeypatch.setattr(
        service,
        "rpc",
        lambda *_: (_ for _ in ()).throw(AssertionError("must not fetch")),
    )
    assert service.summary("owner") is None
    assert service.summaries(["owner"]) == {}


def test_anonymous_report_never_calls_public_community_score(monkeypatch):
    from backend.services.community import community_trust as service
    from backend.services.community.presenter import present_report

    monkeypatch.setattr(
        service,
        "summary",
        lambda *_: (_ for _ in ()).throw(AssertionError("private profile score")),
    )
    row = {
        "id": "test-private",
        "user_id": "private-account",
        "status": "approved",
        "lat": 13.8,
        "lon": 100.1,
        "pm25": 34,
        "captured_at": NOW.isoformat(),
        "created_at": NOW.isoformat(),
        "show_reporter_profile": False,
    }
    result = present_report(
        row,
        reference_at=NOW,
        include_image=False,
        policy_snapshot={"active_version": "v1"},
    )
    assert result["community_trust"] is None
    assert result["user_id"] != "private-account"


def test_reconciliation_resumes_cursor_and_marks_projection_failures_retryable(
    monkeypatch,
):
    from backend.services.community import community_trust as service

    monkeypatch.setattr(service.settings, "community_trust_collection_enabled", True)
    monkeypatch.setattr(service, "control", lambda: {"collecting_enabled": True})
    calls = []

    def fake_rpc(name, params=None):
        calls.append((name, params))
        if name == "community_trust_cursor":
            return 100
        if name == "community_trust_subjects":
            return list(range(101, 201))
        raise AssertionError(name)

    monkeypatch.setattr(service, "rpc", fake_rpc)
    monkeypatch.setattr(
        service,
        "summary",
        lambda user, **_: {
            "status": "unavailable" if user == "150" else "insufficient"
        },
    )
    result = service.reconcile()
    assert (
        result["updated"] == 99
        and result["retryable"] == 1
        and result["next_cursor"] == 200
    )
    assert ("community_trust_cursor", {"p_after": 200, "p_expected": 100}) in calls
