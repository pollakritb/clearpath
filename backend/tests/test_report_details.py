import pytest

from backend.services.community import details


@pytest.fixture
def old_report(monkeypatch):
    row = {
        "id": "RPT-000004",
        "status": "approved",
        "user_id": "owner",
        "captured_at": "2020-01-01T00:00:00Z",
    }
    monkeypatch.setattr(details.supabase_client, "get_community_report", lambda _: row)
    monkeypatch.setattr(
        details,
        "present_report",
        lambda report: {"id": report["id"], "is_fresh": False},
    )
    return row


def test_owner_can_resolve_old_report_without_rejoining_current_map_feed(old_report):
    assert details.published_report(old_report["id"], "owner", "user") == {
        "id": old_report["id"],
        "is_fresh": False,
    }


@pytest.mark.parametrize("status", [None, "pending", "rejected"])
def test_unpublished_or_missing_reports_are_not_exposed(monkeypatch, status):
    monkeypatch.setattr(
        details.supabase_client,
        "get_community_report",
        lambda _: {"status": status} if status else None,
    )
    with pytest.raises(KeyError):
        details.published_report("RPT-000004", "owner", "admin")


def test_archived_report_is_hidden_from_unrelated_users(old_report, monkeypatch):
    with pytest.raises(KeyError):
        details.published_report(old_report["id"], "stranger", "user")
    monkeypatch.setattr(
        details.store, "get", lambda _: {"result_report_id": "RPT-000099"}
    )
    with pytest.raises(KeyError):
        details.published_report(old_report["id"], "stranger", "user", "REQ-000001")


def test_request_participant_can_open_only_the_matching_result(old_report, monkeypatch):
    request = {"result_report_id": old_report["id"]}
    monkeypatch.setattr(details.store, "get", lambda _: request)

    def check_access(row, viewer):
        assert row == request
        if viewer != "participant":
            raise KeyError("denied")
        return {}

    monkeypatch.setattr(details.service, "view", check_access)
    assert (
        details.published_report(old_report["id"], "participant", "user", "REQ-000001")[
            "id"
        ]
        == old_report["id"]
    )
    with pytest.raises(KeyError):
        details.published_report(old_report["id"], "stranger", "user", "REQ-000001")


def test_http_missing_report_is_404_and_invalid_identifier_is_422(monkeypatch):
    from fastapi.testclient import TestClient

    from backend.core.auth import AuthenticatedUser, require_user
    from backend.main import app

    monkeypatch.setattr(details.supabase_client, "get_community_report", lambda _: None)
    app.dependency_overrides[require_user] = lambda: AuthenticatedUser(
        "owner", None, "user"
    )
    try:
        with TestClient(app) as client:
            assert client.get("/api/community/reports/RPT-000004").status_code == 404
            assert client.get("/api/community/reports/REQ-000004").status_code == 422
    finally:
        app.dependency_overrides.pop(require_user, None)


def test_http_archived_detail_requires_login(monkeypatch):
    from fastapi.testclient import TestClient

    from backend.core.config import settings
    from backend.main import app

    monkeypatch.setattr(settings, "local_demo_mode", False)
    with TestClient(app) as client:
        assert client.get("/api/community/reports/RPT-000004").status_code == 401


@pytest.mark.parametrize("status", ["approved", "rejected", "pending"])
def test_owner_archive_includes_all_statuses_and_requests_private_image(
    monkeypatch, status
):
    row = {"id": "RPT-000004", "user_id": "owner", "status": status}
    monkeypatch.setattr(details.supabase_client, "get_community_report", lambda _: row)

    def present(value, **options):
        assert options == {
            "include_exact_location": False,
            "include_private_metadata": True,
        }
        return value

    monkeypatch.setattr(details, "present_report", present)
    assert details.owned_report(row["id"], "owner") == row
    with pytest.raises(KeyError):
        details.owned_report(row["id"], "stranger")


def test_owned_archive_endpoint_requires_login_and_hides_missing_or_other_owner(
    monkeypatch,
):
    from fastapi.testclient import TestClient

    from backend.core.auth import AuthenticatedUser, require_user
    from backend.core.config import settings
    from backend.main import app

    monkeypatch.setattr(settings, "local_demo_mode", False)
    with TestClient(app) as client:
        assert client.get("/api/community/me/reports/RPT-000004").status_code == 401
    app.dependency_overrides[require_user] = lambda: AuthenticatedUser(
        "owner", None, "user"
    )
    try:
        with TestClient(app) as client:
            for row in [
                None,
                {"id": "RPT-000004", "user_id": "stranger", "status": "approved"},
            ]:
                monkeypatch.setattr(
                    details.supabase_client,
                    "get_community_report",
                    lambda _, row=row: row,
                )
                assert (
                    client.get("/api/community/me/reports/RPT-000004").status_code
                    == 404
                )
            assert client.get("/api/community/me/reports/REQ-000004").status_code == 422
    finally:
        app.dependency_overrides.pop(require_user, None)
