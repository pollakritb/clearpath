from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.algorithms.measurement_requests import (
    eligible_helper,
    qualifying_report,
    request_window,
)
from backend.core.auth import AuthenticatedUser, require_user
from backend.core.config import settings
from backend.main import create_app
from backend.services import local_store
from backend.services.measurement import service, store


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setattr(settings, "local_demo_mode", True)
    monkeypatch.setattr(settings, "line_channel_access_token", "")
    for data in (
        store.REQUESTS,
        store.PRESENCES,
        store.RECIPIENTS,
        store.NOTIFIED,
        store.LEASES,
    ):
        data.clear()
    owner, helper, outsider = [str(uuid4()) for _ in range(3)]
    for uid in (owner, helper, outsider):
        local_store.ensure_profile(uid, "tester")
    yield owner, helper, outsider
    for data in (
        store.REQUESTS,
        store.PRESENCES,
        store.RECIPIENTS,
        store.NOTIFIED,
        store.LEASES,
    ):
        data.clear()


def create(owner, **extra):
    return service.create(
        owner,
        {
            "place_name": "สถานที่ A",
            "lat": 13.8,
            "lon": 100.1,
            "radius_km": 3,
            "needed_by": None,
            "idempotency_key": str(uuid4()),
            **extra,
        },
    )


def helper_at(uid, **extra):
    store.presence(uid, {"enabled": True})
    return store.presence(
        uid,
        {
            "lat": 13.8,
            "lon": 100.1,
            "accuracy_m": 20,
            "observed_at": (datetime.now(UTC) - timedelta(days=20)).isoformat(),
            **extra,
        },
    )


def test_time_windows():
    now = datetime.now(UTC)
    assert request_window(now, None) == (now, now + timedelta(hours=1))
    assert request_window(now, now + timedelta(hours=2)) == (
        now + timedelta(minutes=90),
        now + timedelta(hours=2),
    )
    assert request_window(now, now + timedelta(minutes=5))[0] == now
    for end in [
        now,
        now - timedelta(seconds=1),
        now + timedelta(hours=25),
        datetime(2026, 1, 1),
    ]:
        with pytest.raises(ValueError):
            request_window(now, end)


def test_latest_visit_gps_has_no_age_expiry_but_excludes_self_and_bad_accuracy(env):
    owner, helper, _ = env
    row = store.get(create(owner)["id"])
    presence = helper_at(helper)
    assert eligible_helper(row, presence)
    assert not eligible_helper(row, {**presence, "user_id": owner})
    assert not eligible_helper(row, {**presence, "accuracy_m": 201})
    assert not eligible_helper(row, {**presence, "lat": 14.5})
    assert not eligible_helper(row, {**presence, "enabled": False})


def test_all_helpers_notified_once_even_across_retries_and_decline(env):
    owner, helper, other = env
    row = create(owner)
    helper_at(helper)
    helper_at(other)
    helper_at(owner)
    service.process()
    service.process()
    assert service.view(store.get(row["id"]), owner)["recipient_count"] == 2
    assert (
        len(
            [
                n
                for n in local_store.list_user_notifications(helper, 100)
                if n.get("entity_id") == row["id"]
            ]
        )
        == 1
    )
    assert "user_id" not in service.view(store.get(row["id"]), helper)
    assert "lat" not in service.view(store.get(row["id"]), helper).get("payload", {})
    assert service.decline(row["id"], helper)["declined"]
    assert not service.delivery_allowed(
        helper,
        {
            "measurement_request_id": row["id"],
            "measurement_kind": "measurement_request",
            "expires_at": row["expires_at"],
        },
    )


def test_new_visitor_is_matched_after_initial_empty_scan_and_optout_erases_gps(env):
    owner, helper, _ = env
    row = create(owner)
    service.process()
    assert not store.recipient(row["id"], helper)
    helper_at(helper)
    service.process()
    assert store.recipient(row["id"], helper)
    service.helper_settings(helper, False)
    assert store.presence(helper)["lat"] is None
    assert store.presence(helper)["observed_at"] is None


def test_more_than_one_helper_batch_is_delivered_without_a_recipient_cap(env):
    owner, *_ = env
    req = create(owner)
    for _ in range(105):
        uid = str(uuid4())
        local_store.ensure_profile(uid, "helper")
        helper_at(uid)
    service.process()
    assert len(store.recipients(req["id"])) == 100
    service.process()
    assert len(store.recipients(req["id"])) == 105
    service.process()
    assert len(store.recipients(req["id"])) == 105


def test_line_delivery_rechecks_expiry_consent_decline_and_atomic_lease(env):
    owner, helper, _ = env
    req = create(owner)
    helper_at(helper)
    local_store.upsert_notification_preferences(
        helper, {"consent_granted": True, "line_enabled": True}
    )
    service.process()
    payload = {
        "measurement_request_id": req["id"],
        "measurement_kind": "measurement_request",
        "expires_at": req["expires_at"],
    }
    assert service.delivery_allowed(helper, payload)
    assert not service.delivery_allowed(
        helper,
        {
            **payload,
            "expires_at": (datetime.now(UTC) - timedelta(seconds=1)).isoformat(),
        },
    )
    local_store.upsert_notification_preferences(helper, {"line_enabled": False})
    assert not service.delivery_allowed(helper, payload)
    local_store.upsert_notification_preferences(helper, {"line_enabled": True})
    service.decline(req["id"], helper)
    assert not service.delivery_allowed(helper, payload)
    service.helper_settings(helper, False)
    assert not service.delivery_allowed(helper, payload)
    with ThreadPoolExecutor(max_workers=8) as pool:
        claims = list(pool.map(lambda _: store.claim_delivery("same-event"), range(8)))
    assert sum(claims) == 1


def test_concurrent_duplicate_creation_and_quota(env):
    owner, *_ = env
    with ThreadPoolExecutor(max_workers=8) as pool:
        rows = list(pool.map(lambda _: create(owner), range(8)))
    assert len({row["id"] for row in rows}) == 1
    create(owner, radius_km=1)
    with pytest.raises(ValueError, match="พร้อมกัน"):
        create(owner, radius_km=5)
    for row in list(store.REQUESTS.values()):
        service.cancel(row["id"], owner)
    third = create(owner, radius_km=5)
    service.cancel(third["id"], owner)
    with pytest.raises(ValueError, match="ต่อวัน"):
        create(owner, lat=13.81)


def test_report_must_be_new_approved_other_person_and_inside_circle(env):
    owner, helper, _ = env
    row = store.get(create(owner)["id"])
    now = datetime.now(UTC).isoformat()
    report = {
        "id": str(uuid4()),
        "user_id": helper,
        "lat": 13.8,
        "lon": 100.1,
        "pm25": 20,
        "status": "approved",
        "captured_at": now,
        "created_at": now,
        "moderated_at": now,
    }
    assert qualifying_report(row, report)
    for changes in [
        {"user_id": owner},
        {"lat": 14.5},
        {"status": "rejected"},
        {"pm25": None},
        {"captured_at": (datetime.now(UTC) - timedelta(hours=1)).isoformat()},
        {"moderated_at": (datetime.now(UTC) + timedelta(hours=2)).isoformat()},
    ]:
        assert not qualifying_report(row, {**report, **changes})


def test_report_fulfils_once_and_expiration_reconciles_before_closing(env, monkeypatch):
    owner, helper, _ = env
    req = create(owner)
    now = datetime.now(UTC).isoformat()
    report = {
        "id": str(uuid4()),
        "user_id": helper,
        "lat": 13.8,
        "lon": 100.1,
        "pm25": 20,
        "status": "approved",
        "captured_at": now,
        "created_at": now,
        "moderated_at": now,
    }
    monkeypatch.setattr(store, "reports", lambda _: iter([report]))
    assert service.process()["fulfilled"] == 1
    assert service.process()["fulfilled"] == 0
    assert store.get(req["id"])["result_report_id"] == report["id"]
    assert (
        len(
            [
                n
                for n in local_store.list_user_notifications(owner, 100)
                if n.get("entity_id") == req["id"]
            ]
        )
        == 1
    )


def test_scheduled_cancel_expire_and_authorization(env):
    owner, helper, outsider = env
    req = create(owner, needed_by=datetime.now(UTC) + timedelta(hours=2))
    helper_at(helper)
    service.process()
    assert not store.recipient(req["id"], helper)
    with pytest.raises(KeyError):
        service.view(store.get(req["id"]), outsider)
    with pytest.raises(KeyError):
        service.cancel(req["id"], helper)
    service.cancel(req["id"], owner)
    service.process()
    assert store.get(req["id"])["status"] == "cancelled"
    req = create(owner, radius_km=1)
    store.REQUESTS[req["id"]]["expires_at"] = (
        datetime.now(UTC) - timedelta(seconds=1)
    ).isoformat()
    assert service.process()["expired"] == 1
    assert store.get(req["id"])["status"] == "expired"


def test_stored_approved_pm25_fulfils_request_and_public_result_hides_exact_location(
    env,
):
    owner, helper, _ = env
    req = create(owner)
    now = datetime.now(UTC).isoformat()
    report_id = str(uuid4())
    local_store.insert_report(
        {
            "id": report_id,
            "user_id": helper,
            "lat": 13.8,
            "lon": 100.1,
            "pm25": 24.5,
            "status": "approved",
            "captured_at": now,
            "created_at": now,
            "moderated_at": now,
            "image_metadata": {"private": "must not leak"},
        }
    )
    try:
        assert service.process()["fulfilled"] == 1
        result = service.view(store.get(req["id"]), owner)["result"]
        assert result["id"] == report_id
        assert result["pm25"] == 24.5
        assert (result["lat"], result["lon"]) != (13.8, 100.1)
        assert result["image_metadata"] is None
    finally:
        with local_store._LOCK:
            local_store._REPORTS.pop(report_id, None)


def test_presence_throttle_and_fresh_sample_validation(env):
    _, helper, _ = env
    service.helper_settings(helper, True)
    now = datetime.now(UTC)
    values = {"lat": 13.8, "lon": 100.1, "accuracy_m": 20, "observed_at": now}
    service.update_presence(helper, values)
    service.update_presence(helper, {**values, "lat": 13.9})
    assert store.presence(helper)["lat"] == 13.8
    with pytest.raises(ValueError):
        service.update_presence(
            helper, {**values, "observed_at": now - timedelta(minutes=3)}
        )


def test_api_hides_requests_and_recipient_coordinates(env):
    owner, helper, outsider = env
    current = [owner]
    app = create_app()
    app.dependency_overrides[require_user] = lambda: AuthenticatedUser(
        current[0], None, "user"
    )
    client = TestClient(app)
    result = client.post(
        "/api/measurement-requests",
        json={
            "place_name": "A",
            "lat": 13.8,
            "lon": 100.1,
            "radius_km": 3,
            "idempotency_key": str(uuid4()),
        },
    )
    assert result.status_code == 201, result.text
    rid = result.json()["id"]
    current[0] = outsider
    assert client.get(f"/api/measurement-requests/{rid}").status_code == 404
    assert client.post(f"/api/measurement-requests/{rid}/cancel").status_code == 404
    assert client.get("/api/measurement-requests").json()["requests"] == []
    current[0] = helper
    assert (
        client.put(
            "/api/measurement-requests/helper", json={"enabled": True}
        ).status_code
        == 200
    )
    assert (
        client.put(
            "/api/measurement-requests/presence",
            json={
                "lat": 13.8,
                "lon": 100.1,
                "accuracy_m": 10,
                "observed_at": datetime.now(UTC).isoformat(),
            },
        ).status_code
        == 200
    )
    service.process()
    detail = client.get(f"/api/measurement-requests/{rid}").json()
    assert not detail["is_owner"] and detail["matched_location_at"]
    assert "user_id" not in detail and "recipients" not in detail
