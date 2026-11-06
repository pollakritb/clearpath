from datetime import UTC, datetime, timedelta

import pytest

from backend.algorithms.reporter_trust import reporter_trust
from backend.core.config import settings
from backend.models.reporter_trust import ReporterTrust
from backend.services.community import reporter_trust as service

NOW = datetime(2026, 11, 6, tzinfo=UTC)


def audit(**updates):
    return (
        dict(
            audit_key="audit-key-0001",
            case_key="case-key-0001",
            sample_key="sample-key-0001",
            user_id="user1",
            report_id="report1",
            revision=1,
            outcome="pass",
            fault_domain="reporting",
            evaluator_key="independent-evaluator",
            evidence_ref="independent-field-artifact",
            evaluated_at=NOW.isoformat(),
        )
        | updates
    )


def test_no_independent_cases_never_fabricates_neutral_score():
    result = reporter_trust([], now=NOW)
    assert result["score"] is None and result["status"] == "insufficient"
    ReporterTrust.model_validate(result)


def test_posterior_is_account_history_not_additive_xp_or_likes():
    rows = [
        audit(
            audit_key=f"audit-key-{i}",
            case_key=f"case-key-{i}",
            sample_key=f"sample-key-{i}",
            outcome="pass" if i < 18 else "problem",
        )
        for i in range(20)
    ]
    result = reporter_trust(rows, now=NOW)
    assert result["score"] == 83.3 and result["evaluated"] == 20
    assert reporter_trust([audit(likes=99999, xp=99999)], now=NOW)["score"] == 60


def test_same_capture_group_counts_once_and_uses_conservative_outcome():
    rows = [
        audit(),
        audit(case_key="another-case", audit_key="another-audit", outcome="unresolved"),
    ]
    result = reporter_trust(rows, now=NOW)
    assert result["score"] is None and result["unresolved"] == 1
    rows.append(
        audit(case_key="third-case", audit_key="third-audit", outcome="problem")
    )
    assert reporter_trust(rows, now=NOW)["problems"] == 1


def test_revision_replaces_old_finding_without_duplicating_sample():
    rows = [
        audit(outcome="problem"),
        audit(audit_key="revised-audit", revision=2, outcome="pass"),
    ]
    for order in [rows, list(reversed(rows))]:
        result = reporter_trust(order, now=NOW)
        assert result["score"] == 60 and result["problems"] == 0
    with pytest.raises(ValueError, match="conflicting"):
        reporter_trust([audit(), audit(outcome="problem")], now=NOW)


def test_device_system_unknown_and_future_are_not_reporter_failures():
    rows = [
        audit(case_key=f"case-{domain}-x", fault_domain=domain, outcome="problem")
        for domain in ["device", "system", "unknown"]
    ]
    rows.append(audit(evaluated_at=(NOW + timedelta(days=1)).isoformat()))
    result = reporter_trust(rows, now=NOW)
    assert result["score"] is None and result["excluded_cases"] == 3


@pytest.mark.parametrize(
    "missing", ["evidence_ref", "evaluator_key", "sample_key", "case_key"]
)
def test_unverified_rows_do_not_count(missing):
    row = audit()
    row.pop(missing)
    assert reporter_trust([row], now=NOW)["score"] is None


def test_no_decay_and_prior_sensitivity_remain_explicit():
    assert reporter_trust([audit()], now=NOW + timedelta(days=900))["score"] == 60
    assert reporter_trust([audit()], now=NOW, prior=1)["score"] == 66.7
    with pytest.raises(ValueError):
        reporter_trust([], now=NOW, prior=0)


def test_ingestion_subject_revisions_and_idempotency(monkeypatch):
    monkeypatch.setattr(settings, "local_demo_mode", True)
    monkeypatch.setattr(service, "DEMO_AUDITS", [])
    monkeypatch.setattr(
        service.db, "get_community_report", lambda rid: {"id": rid, "user_id": "user1"}
    )
    assert service.ingest(audit()) == service.ingest(audit())
    assert len(service.DEMO_AUDITS) == 1
    with pytest.raises(ValueError, match="key conflict"):
        service.ingest(audit(outcome="problem"))
    with pytest.raises(ValueError, match="subject"):
        service.ingest(audit(user_id="user2", audit_key="other-key"))
    with pytest.raises(ValueError, match="identity"):
        service.ingest(
            audit(revision=2, sample_key="changed-session", audit_key="revision-2-key")
        )
    service.ingest(audit(revision=2, outcome="problem", audit_key="revision-2-key"))
    assert service.summary("user1")["score"] == 40
    assert service.summary("user2")["score"] is None


def test_production_without_validation_fails_closed_and_never_reads_db(monkeypatch):
    monkeypatch.setattr(settings, "local_demo_mode", False)
    monkeypatch.setattr(settings, "reporter_trust_enabled", True)
    monkeypatch.setattr(settings, "reporter_trust_validation_ref", "")
    monkeypatch.setattr(
        service.db, "get_client", lambda: pytest.fail("no unvalidated database read")
    )
    assert service.summary("user1")["status"] == "unavailable"


def test_anonymous_report_never_exposes_author_trust(monkeypatch):
    from backend.services.community.presenter import present_report

    monkeypatch.setattr(
        service,
        "summary",
        lambda uid: pytest.fail("anonymous identity must not be queried"),
    )
    row = dict(
        id="rpt1",
        user_id="user1",
        lat=13.8,
        lon=100,
        pm25=10,
        captured_at=datetime.now(UTC).isoformat(),
        created_at=NOW.isoformat(),
        status="approved",
        show_reporter_profile=False,
    )
    assert present_report(row, include_image=False)["reporter_trust"] is None


def test_review_request_cannot_change_score_or_target_another_account(monkeypatch):
    monkeypatch.setattr(settings, "local_demo_mode", True)
    monkeypatch.setattr(service, "DEMO_AUDITS", [])
    monkeypatch.setattr(service, "DEMO_REVIEWS", {})
    monkeypatch.setattr(
        service.db, "get_community_report", lambda rid: {"id": rid, "user_id": "user1"}
    )
    service.ingest(audit(outcome="problem"))
    before = service.summary("user1")["score"]
    first = service.request_review(
        "user1", "audit-key-0001", "Please check original evidence"
    )
    assert first == service.request_review(
        "user1", "audit-key-0001", "Please check original evidence"
    )
    assert service.summary("user1")["score"] == before
    with pytest.raises(ValueError):
        service.request_review("user2", "audit-key-0001", "Another user's evidence")
    history = service.audit_history("user1")
    assert history["audits"][0]["report_id"] == "report1"
    assert (
        "sample_key" not in history["audits"][0]
        and "evaluator_key" not in history["audits"][0]
    )
    service.ingest(audit(revision=2, outcome="pass", audit_key="revision-2-key"))
    assert service.DEMO_REVIEWS[("user1", "audit-key-0001")]["status"] == "reviewed"
    assert service.summary("user1")["score"] == 60
    with pytest.raises(ValueError, match="ฉบับใหม่"):
        service.request_review("user1", "audit-key-0001", "Please recheck old version")
