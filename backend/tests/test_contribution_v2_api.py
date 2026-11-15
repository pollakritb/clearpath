from datetime import UTC, datetime, timedelta

import pytest

from backend.core.config import settings
from backend.services import local_store, ocr
from backend.services.community import policy_v2, xp_runtime
from backend.tests.test_feature_flows import _create_report
from backend.tests.test_feature_flows import feature_client as feature_client


@pytest.fixture(autouse=True)
def isolate_v2_artifacts(feature_client, monkeypatch):
    before = {str(row["id"]) for row in local_store.list_reports("all", 5000)}
    monkeypatch.setattr(xp_runtime, "_EVENTS", [])
    monkeypatch.setattr(xp_runtime, "_ACCOUNTS", {})
    monkeypatch.setattr(xp_runtime, "_CLAIMS", {})
    yield
    for row in local_store.list_reports("all", 5000):
        if str(row["id"]) not in before:
            local_store.delete_community_report(str(row["id"]))


def test_real_submission_exposes_evidence_and_award_breakdown_without_private_source(
    feature_client, monkeypatch
):
    client, become = feature_client
    monkeypatch.setattr(settings, "community_v2_enabled", True)
    monkeypatch.setattr(
        settings,
        "community_v2_demo_launch",
        (datetime.now(UTC) - timedelta(hours=1)).isoformat(),
    )
    owner = become("user")

    async def read(*_args, **_kwargs):
        return dict(
            pm25=44.0,
            confidence=1,
            device_detected=True,
            display_clear=True,
            raw_text="44",
            available=True,
            evidence_extraction=dict(pm25_field_verified=True, unit_verified=True),
        )

    monkeypatch.setattr(ocr, "read_pm25", read)
    report = _create_report(client, seed=71)
    assert report["status"] == "approved" and report["evidence_policy"] == "evidence-v2"
    assert report["evidence"]["score"] == 100
    assert report["evidence"]["device_status"] == "identified"
    assert report["policy_version"] == "evidence-v2"
    assert report["trust_score"] == 100
    assert local_store.get_profile(owner.id)["reputation_score"] == 0
    assert not report["eligible_for_gap_fill"]
    reward = client.get(f"/api/community/me/reports/{report['id']}/xp").json()
    assert reward["report_xp"] == 10 and reward["first_day_xp"] == 5
    assert reward["policy_version"] == "contribution-v2"
    summary = client.get("/api/community/me/xp").json()
    assert summary["evidence_history"]["evaluated"] == 0
    assert summary["evidence_history"]["pass_rate"] is None
    assert client.get("/api/community/me/leaderboard").json()["period"] == "month"
    local_store.update_report(
        report["id"], dict(measurement_source_key="private-fixture-source")
    )
    public = next(
        r
        for r in client.get("/api/community/reports").json()["reports"]
        if r["id"] == report["id"]
    )
    assert "private-fixture-source" not in str(public)
    assert abs(public["lat"] - report["lat"]) > 0
    become("user")
    engagement = client.get(
        f"/api/community/reports/{report['id']}/engagement/me"
    ).json()
    assert engagement["reaction_radius_m"] == 500
    assert engagement["location_required"]
    missing = client.put(
        f"/api/community/reports/{report['id']}/reaction", json=dict(reaction="like")
    )
    assert missing.status_code == 400
    fix = dict(
        lat=report["lat"],
        lon=report["lon"],
        accuracy_m=15,
        observed_at=datetime.now(UTC).isoformat(),
    )
    vote = client.put(
        f"/api/community/reports/{report['id']}/reaction",
        json=dict(reaction="like", location=fix, reason_code="useful"),
    )
    assert vote.status_code == 200, vote.text
    assert local_store.get_report(report["id"])["evidence_v2"]["score"] == 100
    # Social feedback must never generate new points or independent outcomes.
    assert policy_v2.outcomes(owner.id)["evaluated"] == 0
    assert not any(e["kind"] in {"like", "dislike"} for e in xp_runtime._EVENTS)
    assert client.post("/api/community/xp/events/1/reverse", json={}).status_code == 404


def test_unknown_or_wrong_units_can_publish_but_cannot_fill_gap(
    feature_client, monkeypatch
):
    client, _ = feature_client
    monkeypatch.setattr(settings, "community_v2_enabled", True)
    monkeypatch.setattr(
        settings,
        "community_v2_demo_launch",
        (datetime.now(UTC) - timedelta(hours=1)).isoformat(),
    )

    async def read(*_args, **_kwargs):
        return dict(
            pm25=40,
            confidence=1,
            device_detected=True,
            display_clear=True,
            raw_text="40",
            available=True,
            evidence_extraction=dict(pm25_field_verified=False, unit_verified=None),
        )

    monkeypatch.setattr(ocr, "read_pm25", read)
    r = _create_report(client, seed=79)
    assert r["status"] == "approved" and r["pm25"] == 40
    assert r["evidence"]["score"] == 80 and not r["eligible_for_gap_fill"]
    assert {"pm25_field_verified", "unit_verified"}.issubset(r["evidence"]["blockers"])


def test_evidence_storage_outage_never_undoes_numeric_publication(
    feature_client, monkeypatch
):
    from backend.core.errors import UpstreamError

    client, _ = feature_client
    monkeypatch.setattr(settings, "community_v2_enabled", True)

    async def read(*_args, **_kwargs):
        return dict(
            pm25=42,
            confidence=1,
            device_detected=True,
            display_clear=True,
            raw_text="42",
            available=True,
        )

    monkeypatch.setattr(ocr, "read_pm25", read)

    def unavailable(*_args, **_kwargs):
        raise UpstreamError("evidence store unavailable")

    monkeypatch.setattr(policy_v2, "save_evidence", unavailable)
    r = _create_report(client, seed=2001)
    assert r["status"] == "approved" and r["pm25"] == 42
    assert r["evidence"] is None and not r["eligible_for_gap_fill"]
    assert local_store.get_report(r["id"])["status"] == "approved"


@pytest.mark.parametrize("value", [42, None])
@pytest.mark.parametrize("dependency", ["policy", "registered"])
def test_optional_control_outages_never_block_final_ocr_publication(
    feature_client, monkeypatch, value, dependency
):
    from backend.core.errors import UpstreamError
    from backend.services.measurement import registered

    client, _ = feature_client
    monkeypatch.setattr(settings, "community_v2_enabled", True)

    async def read(*_args, **_kwargs):
        return dict(
            pm25=value,
            confidence=1,
            device_detected=True,
            display_clear=True,
            raw_text="42",
            available=True,
        )

    def unavailable(*_args, **_kwargs):
        raise UpstreamError("optional control unavailable")

    monkeypatch.setattr(ocr, "read_pm25", read)
    if dependency == "policy":
        monkeypatch.setattr(policy_v2, "release", unavailable)
    else:
        monkeypatch.setattr(registered, "enabled", unavailable)
    r = _create_report(
        client, seed=4011 + (value is None) + (dependency == "registered") * 10
    )
    assert r["status"] == ("approved" if value is not None else "rejected")
    assert local_store.get_report(r["id"])["status"] == r["status"]
    if dependency == "policy":
        assert r["evidence_policy"] == "unavailable"
        assert not r["eligible_for_gap_fill"]
    assert not any(
        e.get("report_id") == r["id"] and e["points"] > 0 for e in xp_runtime._EVENTS
    )


def test_retry_after_policy_recovery_reuses_report_and_restores_evidence(
    feature_client, monkeypatch
):
    from backend.core.errors import UpstreamError

    client, _ = feature_client
    monkeypatch.setattr(settings, "community_v2_enabled", True)
    monkeypatch.setattr(
        settings,
        "community_v2_demo_launch",
        (datetime.now(UTC) - timedelta(hours=1)).isoformat(),
    )

    async def read(*_args, **_kwargs):
        return dict(
            pm25=42,
            confidence=1,
            device_detected=True,
            display_clear=True,
            raw_text="42",
            available=True,
            evidence_extraction=dict(pm25_field_verified=True, unit_verified=True),
        )

    monkeypatch.setattr(ocr, "read_pm25", read)
    with monkeypatch.context() as outage:

        def unavailable():
            raise UpstreamError("policy unavailable")

        outage.setattr(policy_v2, "release", unavailable)
        report = _create_report(client, seed=4081)
    stored = local_store.get_report(report["id"])
    assert not any(e.get("report_id") == report["id"] for e in xp_runtime._EVENTS)
    draft_id = next(
        r["id"]
        for r in local_store._REPORT_DRAFTS.values()
        if r["image_path"] == stored["image_path"]
    )
    response = client.post(
        f"/api/community/report-drafts/{draft_id}/submit",
        json={"user_claimed_pm25": 42},
    )
    assert response.status_code == 201, response.text
    retried = response.json()["report"]
    assert retried["id"] == report["id"]
    assert retried["evidence"]["score"] == 100
    first = [e for e in xp_runtime._EVENTS if e.get("report_id") == report["id"]]
    again = client.post(
        f"/api/community/report-drafts/{draft_id}/submit",
        json={"user_claimed_pm25": 42},
    )
    assert again.status_code == 201
    assert [
        e for e in xp_runtime._EVENTS if e.get("report_id") == report["id"]
    ] == first
