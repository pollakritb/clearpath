"""Admin privileges authorize observation, never application mutations."""

import pytest
from fastapi.testclient import TestClient

from backend.core.auth import AuthenticatedUser, require_user
from backend.main import create_app


def test_admin_api_exposes_only_read_methods():
    schema = create_app().openapi()
    for path, operations in schema["paths"].items():
        if path.startswith("/api/admin/") or path == "/api/community/xp/admin":
            assert set(operations) <= {"get", "head", "options"}, path
    assert "/api/community/xp/events/{event_id}/reverse" not in schema["paths"]


@pytest.mark.parametrize("role", ["admin", "moderator", "user"])
@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("post", "/api/admin/announcements"),
        ("patch", "/api/admin/announcements/123"),
        ("delete", "/api/admin/announcements/123"),
        ("post", "/api/admin/announcement-images"),
        ("post", "/api/admin/activities"),
        ("patch", "/api/admin/profiles/123/role"),
        ("patch", "/api/admin/data-issues/123"),
        ("put", "/api/admin/forecast-false-safe-cases/123/12/served/review"),
        ("post", "/api/community/xp/events/123/reverse"),
    ],
)
def test_admin_mutation_paths_are_unavailable(role, method, path):
    app = create_app()
    app.dependency_overrides[require_user] = lambda: AuthenticatedUser(
        id="viewer", email=None, role=role
    )
    with TestClient(app) as client:
        response = client.request(method.upper(), path, json={})
    assert response.status_code in {404, 405}
