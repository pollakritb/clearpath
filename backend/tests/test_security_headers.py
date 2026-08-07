from fastapi.testclient import TestClient

from backend.main import create_app


def test_api_security_headers_and_request_id():
    response = TestClient(create_app()).get(
        "/api/health", headers={"X-Request-ID": "test-request-123"}
    )
    assert response.status_code == 200
    assert response.headers["x-request-id"] == "test-request-123"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"


def test_invalid_request_id_is_replaced():
    response = TestClient(create_app()).get(
        "/api/health", headers={"X-Request-ID": "invalid request id"}
    )
    assert response.status_code == 200
    assert response.headers["x-request-id"] != "invalid request id"
