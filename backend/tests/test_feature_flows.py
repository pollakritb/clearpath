from __future__ import annotations

from io import BytesIO
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from backend.core.auth import AuthenticatedUser, require_user
from backend.core.config import settings
from backend.main import create_app
from backend.services import firms as firms_service
from backend.services import openweather


@pytest.fixture
def feature_client(monkeypatch):
    monkeypatch.setattr(settings, "local_demo_mode", True)
    monkeypatch.setattr(
        settings, "capture_session_secret", "test-capture-secret-32-bytes-long"
    )
    monkeypatch.setattr(settings, "openai_api_key", "")
    monkeypatch.setattr(settings, "push_enabled", False)

    async def fake_weather(_lat: float, _lon: float) -> dict:
        return {
            "temp": 31.5,
            "humidity": 62,
            "wind_speed": 2.4,
            "wind_deg": 180,
            "description": "ท้องฟ้าโปร่ง",
            "icon": "01d",
        }

    async def fake_fires(_days: int = 1) -> list[dict]:
        return [
            {
                "lat": 13.82,
                "lon": 100.06,
                "frp": 4.2,
                "bright": 320.0,
                "daynight": "D",
                "acq_date": "2026-07-23",
                "acquired_at": "2026-07-23T06:00:00+00:00",
                "confidence": "nominal",
                "satellite": "VIIRS_SNPP_NRT",
            },
            {"lat": 13.7563, "lon": 100.5018, "frp": 20.0},
        ]

    monkeypatch.setattr(openweather, "get_weather", fake_weather)
    monkeypatch.setattr(firms_service, "get_fires", fake_fires)

    current = {
        "user": AuthenticatedUser(
            id=f"test-user-{uuid4()}",
            email="user@example.test",
            role="user",
            display_name="Test User",
        )
    }

    def identity() -> AuthenticatedUser:
        return current["user"]

    def become(role: str = "user", *, user_id: str | None = None) -> AuthenticatedUser:
        user = AuthenticatedUser(
            id=user_id or f"test-{role}-{uuid4()}",
            email=f"{role}@example.test",
            role=role,
            display_name=f"Test {role.title()}",
        )
        current["user"] = user
        return user

    app = create_app()
    app.dependency_overrides[require_user] = identity
    with TestClient(app) as client:
        yield client, become


def _meter_image(seed: int) -> bytes:
    image = Image.new(
        "RGB",
        (96, 48),
        color=((seed * 37) % 255, (seed * 67) % 255, (seed * 97) % 255),
    )
    image.putpixel((seed % 96, seed % 48), (255, 255, 255))
    output = BytesIO()
    image.save(output, format="PNG")
    return output.getvalue()


def _create_pending_report(client: TestClient, seed: int = 1) -> dict:
    session_response = client.post("/api/community/capture-session")
    assert session_response.status_code == 200
    session = session_response.json()

    draft_response = client.post(
        "/api/community/report-drafts",
        data={
            "lat": "13.8199",
            "lon": "100.0622",
            "gps_accuracy_m": "15",
            "camera_session_token": session["token"],
            "client_captured_at": session["issued_at"],
        },
        files={"image": ("meter.png", _meter_image(seed), "image/png")},
    )
    assert draft_response.status_code == 201, draft_response.text
    draft = draft_response.json()
    assert draft["ocr_available"] is False
    assert draft["image_preview_url"]

    submit_response = client.post(
        f"/api/community/report-drafts/{draft['id']}/submit",
        json={
            "user_claimed_pm25": 42.5,
            "display_name": "ผู้ทดสอบระบบ",
            "device_model": "Acceptance Meter",
            "device_calibrated": True,
            "calibrated_at": "2026-07-01",
            "measurement_environment": "outdoor",
            "measurement_stable": True,
            "near_emission_source": False,
            "measurement_note": "integration acceptance test",
            "averaging_period": "1_minute",
            "measurement_duration_seconds": 60,
        },
    )
    assert submit_response.status_code == 201, submit_response.text
    return submit_response.json()["report"]


def test_complete_report_moderation_rating_reward_and_privacy_flow(feature_client):
    client, become = feature_client
    reporter = become("user")
    pending = _create_pending_report(client, seed=11)
    report_id = pending["id"]

    assert pending["status"] == "pending"
    assert pending["pm25"] is None
    assert pending["gps_accuracy_m"] == 15
    assert all(
        item["id"] != report_id
        for item in client.get("/api/community/reports").json()["reports"]
    )

    become("admin")
    queue = client.get("/api/admin/reports")
    assert queue.status_code == 200
    assert any(item["id"] == report_id for item in queue.json()["reports"])

    incomplete = client.post(
        f"/api/admin/reports/{report_id}/moderate",
        json={"decision": "approve", "verified_pm25": 44, "checks": {}},
    )
    assert incomplete.status_code == 400

    approved_response = client.post(
        f"/api/admin/reports/{report_id}/moderate",
        json={
            "decision": "approve",
            "verified_pm25": 44,
            "note": "evidence verified",
            "checks": {
                "image_clear": True,
                "value_matches_display": True,
                "location_plausible": True,
                "no_screen_recapture_signs": True,
            },
        },
    )
    assert approved_response.status_code == 200, approved_response.text
    assert approved_response.json()["pm25"] == 44

    public_reports = client.get("/api/community/reports").json()["reports"]
    public = next(item for item in public_reports if item["id"] == report_id)
    assert public["admin_verified"] is True
    assert public["pm25"] == 44
    assert public["image_url"] is None
    assert public["gps_accuracy_m"] is None
    assert public["ocr_pm25"] is None
    assert public["user_claimed_pm25"] is None
    assert (public["lat"], public["lon"]) != (13.8199, 100.0622)
    assert public["location_precision_m"] > 0

    become("user", user_id=reporter.id)
    self_rating = client.post(
        f"/api/community/reports/{report_id}/ratings",
        json={
            "rating": 5,
            "reviewer_lat": 13.8199,
            "reviewer_lon": 100.0622,
            "gps_accuracy_m": 10,
        },
    )
    assert self_rating.status_code == 400

    become("user")
    far_rating = client.post(
        f"/api/community/reports/{report_id}/ratings",
        json={
            "rating": 5,
            "reviewer_lat": 13.7563,
            "reviewer_lon": 100.5018,
            "gps_accuracy_m": 10,
        },
    )
    assert far_rating.status_code == 400

    rating_result = None
    for score in (5, 4, 5):
        become("user")
        response = client.post(
            f"/api/community/reports/{report_id}/ratings",
            json={
                "rating": score,
                "reviewer_lat": 13.8200,
                "reviewer_lon": 100.0623,
                "gps_accuracy_m": 12,
            },
        )
        assert response.status_code == 200, response.text
        rating_result = response.json()

    assert rating_result is not None
    assert rating_result["rating_count"] == 3
    assert rating_result["rating_average"] > 4
    assert rating_result["consensus"] == "positive"
    assert rating_result["reward_points"] == 2

    duplicate = client.post(
        f"/api/community/reports/{report_id}/ratings",
        json={
            "rating": 5,
            "reviewer_lat": 13.8200,
            "reviewer_lon": 100.0623,
            "gps_accuracy_m": 12,
        },
    )
    assert duplicate.status_code == 400

    become("user", user_id=reporter.id)
    profile = client.get("/api/community/me")
    assert profile.status_code == 200
    assert profile.json()["approved_reports"] == 1
    assert profile.json()["reputation_score"] > 0
    assert profile.json()["weekly_points"] > 0

    inbox = client.get("/api/notifications")
    assert inbox.status_code == 200
    assert inbox.json()["unread_count"] >= 4
    notification_id = inbox.json()["notifications"][0]["id"]
    assert client.patch(f"/api/notifications/{notification_id}/read").status_code == 200
    assert client.post("/api/notifications/read-all").status_code == 200
    assert client.get("/api/notifications").json()["unread_count"] == 0

    leaderboard = client.get("/api/community/leaderboard")
    assert leaderboard.status_code == 200
    assert any(item["user_id"] == reporter.id for item in leaderboard.json()["users"])


def test_camera_evidence_validation_and_single_use_session(feature_client):
    client, become = feature_client
    become("user")
    session = client.post("/api/community/capture-session").json()

    outside = client.post(
        "/api/community/report-drafts",
        data={
            "lat": "13.7563",
            "lon": "100.5018",
            "gps_accuracy_m": "10",
            "camera_session_token": session["token"],
        },
        files={"image": ("meter.png", _meter_image(21), "image/png")},
    )
    assert outside.status_code == 400

    valid = client.post(
        "/api/community/report-drafts",
        data={
            "lat": "13.8199",
            "lon": "100.0622",
            "gps_accuracy_m": "10",
            "camera_session_token": session["token"],
        },
        files={"image": ("meter.png", _meter_image(22), "image/png")},
    )
    assert valid.status_code == 201, valid.text

    reused = client.post(
        "/api/community/report-drafts",
        data={
            "lat": "13.8199",
            "lon": "100.0622",
            "gps_accuracy_m": "10",
            "camera_session_token": session["token"],
        },
        files={"image": ("meter.png", _meter_image(23), "image/png")},
    )
    assert reused.status_code == 400

    bad_type_session = client.post("/api/community/capture-session").json()
    bad_type = client.post(
        "/api/community/report-drafts",
        data={
            "lat": "13.8199",
            "lon": "100.0622",
            "gps_accuracy_m": "10",
            "camera_session_token": bad_type_session["token"],
        },
        files={"image": ("meter.txt", b"not an image", "text/plain")},
    )
    assert bad_type.status_code == 415


def test_role_guards_and_report_rejection_flow(feature_client):
    client, become = feature_client
    reporter = become("user")

    assert client.get("/api/admin/reports").status_code == 403
    assert client.get("/api/admin/announcements").status_code == 403

    pending = _create_pending_report(client, seed=41)
    report_id = pending["id"]

    become("moderator")
    missing_reason = client.post(
        f"/api/admin/reports/{report_id}/moderate",
        json={"decision": "reject", "checks": {}, "note": "evidence failed"},
    )
    assert missing_reason.status_code == 400

    rejected = client.post(
        f"/api/admin/reports/{report_id}/moderate",
        json={
            "decision": "reject",
            "rejection_reason_code": "image_unclear",
            "checks": {},
            "note": "หน้าจอเครื่องวัดไม่ชัด",
        },
    )
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["status"] == "rejected"
    assert rejected.json()["rejection_reason_code"] == "image_unclear"

    public = client.get("/api/community/reports").json()["reports"]
    assert all(item["id"] != report_id for item in public)

    become("user", user_id=reporter.id)
    profile = client.get("/api/community/me")
    own_report = next(
        item for item in profile.json()["reports"] if item["id"] == report_id
    )
    assert own_report["status"] == "rejected"
    assert own_report["rejection_reason_code"] == "image_unclear"
    inbox = client.get("/api/notifications").json()
    assert inbox["unread_count"] == 1
    assert inbox["notifications"][0]["event_type"] == "report_status"


def test_announcement_activity_notification_preferences_and_push_contract(
    feature_client,
):
    client, become = feature_client
    member = become("user")
    preferences = client.put(
        "/api/notifications/preferences",
        json={
            "air_alerts": True,
            "hotspot_alerts": True,
            "report_status_alerts": True,
            "rating_alerts": True,
            "reward_alerts": True,
            "leaderboard_alerts": True,
            "announcement_alerts": False,
        },
    )
    assert preferences.status_code == 200
    assert preferences.json()["announcement_alerts"] is False
    assert client.get("/api/notifications/preferences").json() == preferences.json()

    become("admin")
    draft = client.post(
        "/api/admin/announcements",
        json={
            "title": f"Draft {uuid4()}",
            "body": "ยังไม่ควรเผยแพร่",
            "kind": "alert",
            "area": "นครปฐม",
            "status": "draft",
        },
    )
    assert draft.status_code == 201, draft.text
    announcement_id = draft.json()["id"]

    public_before = client.get("/api/community/announcements").json()["announcements"]
    assert all(item["id"] != announcement_id for item in public_before)

    image_upload = client.post(
        "/api/admin/announcement-images",
        files={"image": ("announcement.png", _meter_image(31), "image/png")},
    )
    assert image_upload.status_code == 200
    assert image_upload.json()["url"]

    published = client.patch(
        f"/api/admin/announcements/{announcement_id}",
        json={"status": "published", "image_path": image_upload.json()["path"]},
    )
    assert published.status_code == 200
    assert published.json()["status"] == "published"
    assert published.json()["image_url"]
    public_after = client.get("/api/community/announcements").json()["announcements"]
    assert any(item["id"] == announcement_id for item in public_after)

    become("user", user_id=member.id)
    assert client.get("/api/notifications").json()["unread_count"] == 0

    become("admin")
    activity = client.post(
        "/api/admin/activities",
        json={
            "title": f"Activity {uuid4()}",
            "description": "ช่วยตรวจรายงานในพื้นที่",
            "reward_points": 5,
        },
    )
    assert activity.status_code == 201
    activities = client.get("/api/community/activities").json()["activities"]
    assert any(item["id"] == activity.json()["id"] for item in activities)

    archived = client.delete(f"/api/admin/announcements/{announcement_id}")
    assert archived.status_code == 200
    assert archived.json()["status"] == "archived"
    public_archived = client.get("/api/community/announcements").json()["announcements"]
    assert all(item["id"] != announcement_id for item in public_archived)

    become("user", user_id=member.id)
    config = client.get("/api/notifications/config")
    assert config.status_code == 200
    assert config.json() == {"enabled": False, "public_key": None}
    subscription = {
        "endpoint": f"https://push.example.test/{uuid4()}",
        "keys": {"p256dh": "test-p256dh-key-material", "auth": "test-auth"},
        "user_agent": "pytest",
    }
    assert (
        client.post("/api/notifications/subscriptions", json=subscription).status_code
        == 200
    )
    assert (
        client.request(
            "DELETE",
            "/api/notifications/subscriptions",
            json={"endpoint": subscription["endpoint"]},
        ).status_code
        == 200
    )


def test_official_history_forecast_search_validation_and_admin_health(feature_client):
    client, become = feature_client
    become("user")

    stations_response = client.get("/api/pm25/current")
    assert stations_response.status_code == 200
    stations = stations_response.json()["stations"]
    assert stations
    station_id = stations[0]["id"]

    history = client.get("/api/history", params={"station_id": station_id, "hours": 24})
    assert history.status_code == 200
    assert history.json()["points"]

    forecast = client.get(
        "/api/forecast", params={"station_id": station_id, "hours": 12}
    )
    assert forecast.status_code == 200
    assert len(forecast.json()["points"]) == 12
    assert forecast.json()["method"] in {
        "damped-local-trend-v1",
        "hybrid_xgboost_gated",
    }

    search = client.get("/api/locations/search", params={"q": "นครปฐม"})
    assert search.status_code == 200
    assert search.json()["locations"]

    validation = client.get("/api/validate", params={"method": "idw"})
    assert validation.status_code == 200
    assert validation.json()["station_count"] > 0
    assert validation.json()["idw"] is not None

    weather = client.get("/api/weather", params={"lat": 13.8199, "lon": 100.0622})
    assert weather.status_code == 200
    assert weather.json()["temp"] == 31.5
    firms = client.get("/api/firms")
    assert firms.status_code == 200
    assert firms.json()["count"] == 1

    become("admin")
    assert client.get("/api/admin/reports").status_code == 200
    assert client.get("/api/admin/sync-runs").status_code == 200
    assert client.get("/api/admin/forecast-models").status_code == 200
    assert client.get("/api/admin/notification-outbox").status_code == 200
