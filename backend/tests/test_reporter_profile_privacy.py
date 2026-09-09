from datetime import UTC, datetime

from backend.models.community import ReportDraftSubmit
from backend.services.community.presenter import present_report


def _report(**overrides) -> dict:
    now = datetime.now(UTC).isoformat()
    row = {
        "id": "report-1",
        "user_id": "user-1",
        "display_name": "Google Reporter",
        "reporter_avatar_url": "https://lh3.googleusercontent.com/a/reporter",
        "show_reporter_profile": False,
        "source_type": "individual",
        "lat": 13.8199,
        "lon": 100.0622,
        "pm25": 24.0,
        "captured_at": now,
        "created_at": now,
        "status": "approved",
        "trust_score": 82,
    }
    row.update(overrides)
    return row


def test_public_report_hides_google_identity_by_default():
    report = present_report(_report(), include_image=False)

    assert report["show_reporter_profile"] is False
    assert report["display_name"] is None
    assert report["reporter_avatar_url"] is None


def test_report_submission_defaults_to_hidden_identity():
    body = ReportDraftSubmit(user_claimed_pm25=12.5)

    assert body.hide_identity is True


def test_public_report_exposes_opted_in_google_profile():
    report = present_report(
        _report(show_reporter_profile=True),
        include_image=False,
    )

    assert report["show_reporter_profile"] is True
    assert report["display_name"] == "Google Reporter"
    assert report["reporter_avatar_url"].startswith(
        "https://lh3.googleusercontent.com/"
    )


def test_community_sensor_never_exposes_personal_profile():
    report = present_report(
        _report(show_reporter_profile=True, source_type="community_sensor"),
        include_image=False,
    )

    assert report["show_reporter_profile"] is False
    assert report["display_name"] is None
    assert report["reporter_avatar_url"] is None
