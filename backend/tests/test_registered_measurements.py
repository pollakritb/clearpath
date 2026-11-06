from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.core.auth import AuthenticatedUser, require_user
from backend.core.config import settings
from backend.main import create_app
from backend.services import local_store
from backend.services.community import xp
from backend.services.measurement import registered, service, store


@pytest.fixture
def feature(monkeypatch):
    monkeypatch.setattr(settings, "local_demo_mode", True)
    monkeypatch.setattr(settings, "measurement_registered_locations_enabled", True)
    monkeypatch.setattr(registered, "line_allowed", lambda uid: True)
    data = [
        store.REQUESTS,
        store.PRESENCES,
        store.RECIPIENTS,
        store.NOTIFIED,
        store.LEASES,
        registered.LOCATIONS,
        registered.BATCHES,
        registered.JOBS,
        registered.MATCHES,
        local_store._REPORTS,
        local_store._REPORT_EVIDENCE,
        local_store._USER_NOTIFICATIONS,
        local_store._NOTIFICATION_OUTBOX,
        xp._ACCOUNTS,
        xp._EVENTS,
        xp._CLAIMS,
    ]
    for mapping in data:
        mapping.clear()
    users = [str(uuid4()) for _ in range(6)]
    for user in users:
        local_store.ensure_profile(user, "Member")
    yield users
    for mapping in data:
        mapping.clear()


def place(uid, **values):
    return registered.save_location(
        uid,
        dict(name="Home", address="Private address", lat=13.8, lon=100.1, enabled=True)
        | values,
    )


def request(uid, **values):
    row = service.create(
        uid,
        dict(
            place_name="Area",
            lat=13.8,
            lon=100.1,
            radius_km=2,
            idempotency_key=str(uuid4()),
        )
        | values,
    )
    store.REQUESTS[row["id"]]["starts_at"] = (
        datetime.now(UTC) - timedelta(minutes=10)
    ).isoformat()
    return row


def report(uid, **values):
    now = datetime.now(UTC)
    row = (
        dict(
            id="report-auto",
            user_id=uid,
            status="approved",
            pm25=22,
            lat=13.8,
            lon=100.1,
            captured_at=(now - timedelta(minutes=2)).isoformat(),
            created_at=(now - timedelta(minutes=1)).isoformat(),
            moderated_at=now.isoformat(),
            capture_source="camera",
        )
        | values
    )
    local_store._REPORTS[row["id"]] = row
    local_store._REPORT_EVIDENCE[row["id"]] = dict(
        report_id=row["id"],
        image_metadata={
            "bonus_gps_at_submission": dict(lat=13.8, lon=100.1, accuracy_m=20)
        },
    )
    return row


def test_registered_locations_cap_is_atomic_and_counts_paused_places(feature):
    uid = feature[0]

    def save(i):
        try:
            return place(uid, name=f"Place {i}", enabled=False)["slot"]
        except ValueError:
            return None

    with ThreadPoolExecutor(max_workers=6) as workers:
        results = list(workers.map(save, range(6)))
    assert sorted(n for n in results if n) == [1, 2]
    assert len(registered.locations(uid)) == 2
    with pytest.raises(ValueError, match="อย่างน้อย 1"):
        service.helper_settings(uid, True)
    registered.delete_location(uid, 1)
    assert place(uid)["slot"] == 1


def test_registered_helper_ignores_presence_and_deduplicates_two_points(feature):
    owner, helper = feature[:2]
    request(owner)
    place(helper)
    place(helper, name="Work")
    service.helper_settings(helper, True)
    service.update_presence(
        helper, dict(lat=19, lon=104, accuracy_m=5, observed_at="2000-01-01T00:00:00Z")
    )
    assert store.presence(helper).get("lat") is None
    service.process()
    service.process()
    assert len(store.RECIPIENTS) == 1
    assert len(registered.BATCHES) == 1
    assert len(local_store._NOTIFICATION_OUTBOX) == 1
    settings_view = service.helper_settings(helper)
    assert len(settings_view["locations"]) == 2 and settings_view["observed_at"] is None


def test_five_requests_one_report_no_claim_one_bonus(feature):
    owners, helper = feature[:5], feature[5]
    for uid in owners:
        request(uid)
    place(helper)
    service.helper_settings(helper, True)
    service.process()
    assert len(registered.BATCHES) == 1
    batch = next(iter(registered.BATCHES.values()))
    assert len(registered.prepare_group(batch["id"], helper)["request_ids"]) == 5
    r = report(helper)
    service.process()
    service.process()
    assert all(
        row["status"] == "fulfilled" and row["result_report_id"] == r["id"]
        for row in store.REQUESTS.values()
    )
    result = xp.reward_report(r)
    xp.reward_report(r)
    assert result["matched_request_count"] == 5 and result["help_xp"] == 5
    assert len([e for e in xp._EVENTS if e["kind"] == "help" and e["points"] > 0]) == 1
    assert not xp._CLAIMS
    assert registered.prepare_group(batch["id"], helper) is None


def test_own_request_gets_result_but_not_help_bonus(feature):
    uid = feature[0]
    request(uid)
    r = report(uid)
    registered.process_matches()
    result = xp.reward_report(r)
    assert result["matched_request_count"] == 1
    assert result["help_xp"] == 0 and result["report_xp"] == 10


@pytest.mark.parametrize("kind", ["outside", "rejected", "old", "late", "cancelled"])
def test_only_eligible_requests_are_matched(feature, kind):
    owner, helper = feature[:2]
    row = request(owner)
    extra = {}
    if kind == "outside":
        extra["lat"] = 15
    if kind == "rejected":
        extra["status"] = "rejected"
    if kind == "old":
        extra["captured_at"] = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    if kind == "late":
        extra["moderated_at"] = (datetime.now(UTC) + timedelta(days=1)).isoformat()
    if kind == "cancelled":
        store.finish(row["id"], "cancelled")
    report(helper, **extra)
    registered.process_matches()
    assert registered.match_count("report-auto") == 0


def test_outbox_revalidation_drops_deleted_paused_or_closed_requests(feature):
    owner, helper = feature[:2]
    row = request(owner)
    place(helper)
    service.helper_settings(helper, True)
    service.process()
    batch = next(iter(registered.BATCHES.values()))
    assert registered.prepare_group(batch["id"], helper)
    service.helper_settings(helper, False)
    assert registered.prepare_group(batch["id"], helper) is None
    service.helper_settings(helper, True)
    assert registered.prepare_group(batch["id"], helper)
    service.cancel(row["id"], owner)
    assert registered.prepare_group(batch["id"], helper) is None
    with pytest.raises(KeyError):
        registered.group_requests(batch["id"], feature[2])


def test_location_api_has_owner_isolation_and_valid_slot_parsing(feature):
    app = create_app()
    uid = feature[0]
    app.dependency_overrides[require_user] = lambda: AuthenticatedUser(
        id=uid, email=None, role="user"
    )
    body = dict(name="Home", address="Private", lat=13.8, lon=100.1, enabled=True)
    with TestClient(app) as client:
        assert (
            client.post(
                "/api/measurement-requests/helper/locations", json=body
            ).status_code
            == 201
        )
        assert (
            client.patch(
                "/api/measurement-requests/helper/locations/1", json=body
            ).status_code
            == 200
        )
        assert (
            client.patch(
                "/api/measurement-requests/helper/locations/3", json=body
            ).status_code
            == 422
        )
        uid = feature[1]
        assert client.get("/api/measurement-requests/helper/locations").json() == []
        assert (
            client.delete("/api/measurement-requests/helper/locations/1").status_code
            == 404
        )
        assert (
            client.post(
                "/api/measurement-requests/helper/locations", json={**body, "name": " "}
            ).status_code
            == 422
        )


def test_saved_location_emoji_round_trip_and_validation(feature):
    from pydantic import ValidationError

    from backend.models.measurement import MeasurementHelperLocationWrite

    saved = place("owner", emoji="🏠")
    assert registered.locations("owner")[0]["emoji"] == "🏠"
    assert registered.locations("other") == []
    updated = registered.save_location("owner", {**saved, "emoji": "🌳"}, saved["slot"])
    assert updated["emoji"] == "🌳"
    with pytest.raises(ValidationError):
        MeasurementHelperLocationWrite(name="Bad", lat=13.8, lon=100.1, emoji="<img>")
    assert MeasurementHelperLocationWrite(name="Old", lat=13.8, lon=100.1).emoji == "📍"
