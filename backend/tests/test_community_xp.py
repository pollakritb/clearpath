from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta

import pytest

from backend.algorithms.community_xp import (
    DAILY_XP_LIMIT,
    HELP_XP,
    REPORT_XP,
    achievements,
    base_eligibility,
    help_eligibility,
    rank_progress,
    thai_day,
)
from backend.services.community import xp
from backend.services.measurement import store

NOW = datetime(2026, 10, 31, 3, tzinfo=UTC)


def report(**values):
    return (
        dict(
            id="r1",
            user_id="helper",
            status="approved",
            created_at=NOW.isoformat(),
            captured_at=NOW.isoformat(),
            moderated_at=NOW.isoformat(),
            lat=14,
            lon=100,
            capture_source="camera",
            pm25=25,
        )
        | values
    )


def request(**values):
    return (
        dict(
            id="req",
            place_name="Test",
            created_at=NOW.isoformat(),
            user_id="owner",
            status="active",
            starts_at=(NOW - timedelta(minutes=10)).isoformat(),
            expires_at=(NOW + timedelta(minutes=10)).isoformat(),
            updated_at=NOW.isoformat(),
            lat=14,
            lon=100,
            radius_km=3,
        )
        | values
    )


def test_fixed_policy_and_rank_thresholds():
    assert (REPORT_XP, HELP_XP, DAILY_XP_LIMIT) == (10, 5, 65)
    assert rank_progress(10000, 2)["code"] == "explorer"
    assert rank_progress(100, 3)["code"] == "reporter"
    assert rank_progress(1500, 19)["code"] == "caretaker"
    assert rank_progress(5000, 60)["code"] == "champion"
    assert achievements(1, 50) == [
        "รายงานแรก",
        "ช่วยคำขอแรก",
        "ช่วยครบ 10 คำขอ",
        "ช่วยครบ 50 คำขอ",
    ]


def test_thai_midnight_and_base_image_rules():
    assert thai_day("2026-10-30T16:59:59Z") == "2026-10-30"
    assert thai_day("2026-10-30T17:00:00Z") == "2026-10-31"
    assert base_eligibility(report(capture_source="gallery")) == "granted"
    assert (
        base_eligibility(
            report(captured_at=(NOW - timedelta(hours=3, seconds=1)).isoformat())
        )
        == "stale"
    )
    assert base_eligibility(report(duplicate_of_report_id="old")) == "duplicate"
    assert base_eligibility(report(status="rejected")) == "not_approved"


def test_claim_evidence_and_grace_rules():
    claim = {"started_at": (NOW - timedelta(minutes=1)).isoformat()}
    gps = {"bonus_gps_at_submission": {"lat": 14, "lon": 100, "accuracy_m": 10}}
    assert help_eligibility(report(), request(), claim, gps) == "granted"
    assert help_eligibility(report(), request(), None, gps) == "no_claim"
    assert (
        help_eligibility(report(user_id="owner"), request(), claim, gps)
        == "invalid_evidence"
    )
    assert (
        help_eligibility(report(capture_source="gallery"), request(), claim, gps)
        == "invalid_evidence"
    )
    assert (
        help_eligibility(
            report(captured_at=(NOW - timedelta(minutes=16)).isoformat()),
            request(),
            claim,
            gps,
        )
        == "invalid_evidence"
    )
    assert (
        help_eligibility(
            report(),
            request(
                status="cancelled", updated_at=(NOW - timedelta(seconds=1)).isoformat()
            ),
            claim,
            gps,
        )
        == "request_closed"
    )
    assert (
        help_eligibility(
            report(),
            request(
                status="fulfilled", updated_at=(NOW - timedelta(minutes=16)).isoformat()
            ),
            claim,
            gps,
        )
        == "request_closed"
    )
    assert (
        help_eligibility(
            report(),
            request(
                status="fulfilled", updated_at=(NOW - timedelta(minutes=5)).isoformat()
            ),
            claim,
            gps,
        )
        == "granted"
    )
    assert (
        help_eligibility(
            report(),
            request(),
            claim,
            {"bonus_gps_at_submission": {"lat": 15, "lon": 100, "accuracy_m": 10}},
        )
        == "invalid_evidence"
    )


@pytest.fixture
def demo(monkeypatch):
    monkeypatch.setattr(xp.settings, "local_demo_mode", True)
    xp._ACCOUNTS.clear()
    xp._EVENTS.clear()
    xp._CLAIMS.clear()
    monkeypatch.setattr(xp.db, "get_report_evidence", lambda _id: {})
    yield
    xp._ACCOUNTS.clear()
    xp._EVENTS.clear()
    xp._CLAIMS.clear()


def test_concurrent_award_idempotency_and_daily_cap(demo):
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda _: xp.reward_report(report()), range(20)))
    assert all(r["report_xp"] == 10 for r in results)
    assert len(xp._EVENTS) == 1
    assert (
        xp.reward_report(
            report(id="cooldown", moderated_at=(NOW + timedelta(minutes=5)).isoformat())
        )["report_xp"]
        == 0
    )
    for i in range(1, 7):
        xp.reward_report(
            report(
                id=f"r{i + 1}",
                moderated_at=(NOW + timedelta(minutes=30 * i)).isoformat(),
            )
        )
    assert xp.summary("helper")["lifetime_xp"] == 50


def test_alias_hidden_ties_and_periods_never_use_reputation(demo):
    xp.reward_report(report())
    xp.reward_report(report(id="other", user_id="other"))
    board = xp.board("all", 0, "helper")
    assert [r["rank"] for r in board["users"]] == [1, 1]
    assert all("user_id" not in r for r in board["users"])
    xp.update_settings("helper", dict(alias="ท้องฟ้าสีฟ้า", hidden=True))
    assert xp.board("all", 0, "helper")["me"]["rank"] is None
    assert xp.board("all", 0, "helper")["me"]["xp"] == 10
    assert xp.summary("helper")["lifetime_xp"] == 10


def test_privacy_does_not_link_anonymous_reports_or_storage(monkeypatch, demo):
    from backend.services.community.presenter import present_report

    r = report(
        image_path="drafts/private-auth-id/private.jpg", show_reporter_profile=False
    )
    first = present_report(r)
    second = present_report(r | {"id": "r2"})
    assert first["user_id"] != second["user_id"]
    assert first["user_id"] != r["user_id"]
    assert first["member_id"] is None and first["participation_rank"] is None
    assert "private-auth-id" not in first["image_url"]
    assert present_report(r, include_private_metadata=True)["user_id"] == "helper"


def test_claim_after_fulfilled_reuses_existing_only(monkeypatch, demo):
    now = datetime.now(UTC)
    row = request(
        starts_at=(now - timedelta(minutes=1)).isoformat(),
        expires_at=(now + timedelta(minutes=30)).isoformat(),
        updated_at=now.isoformat(),
    )
    monkeypatch.setattr(store, "get", lambda _id: row)
    monkeypatch.setattr(store, "recipient", lambda *_args: {"declined": False})
    first = xp.claim("helper", "req")
    row["status"] = "fulfilled"
    assert xp.claim("helper", "req")["started_at"] == first["started_at"]
    with pytest.raises(ValueError):
        xp.claim("new-helper", "req")


def test_xp_outage_keeps_publication_decoration_private(monkeypatch, demo):
    from backend.core.errors import UpstreamError
    from backend.services.community.presenter import present_report

    def unavailable(_id):
        raise UpstreamError("unavailable")

    monkeypatch.setattr(xp, "public_identity", unavailable)
    row = report(
        show_reporter_profile=True, display_name="Private Google Name", pm25=25
    )
    presented = present_report(row, include_image=False)
    assert presented["status"] == "approved"
    assert presented["display_name"] is None
    assert presented["reporter_avatar_url"] is None
    assert presented["user_id"] != row["user_id"]


def test_rollout_control_disables_awards_without_exposing_google(monkeypatch):
    from backend.services.community.presenter import present_report

    monkeypatch.setattr(xp.settings, "local_demo_mode", False)
    monkeypatch.setattr(xp.settings, "community_xp_enabled", True)
    monkeypatch.setattr(
        xp,
        "control",
        lambda: dict(enabled=False, maintenance=False, reset_version="new"),
    )
    assert not xp.enabled()
    assert xp.reward_report(report()) == {"status": "disabled"}
    presented = present_report(
        report(show_reporter_profile=True, display_name="Private Google Name", pm25=25),
        include_image=False,
    )
    assert presented["display_name"] is None
    assert presented["user_id"] != "helper"
