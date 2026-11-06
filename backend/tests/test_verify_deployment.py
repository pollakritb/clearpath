import httpx

from scripts import verify_deployment


def test_smoke_checks_use_health_readiness_and_protected_admin_only(monkeypatch):
    calls = []

    def respond(request):
        calls.append((request.method, request.url.path))
        if request.url.path == "/api/admin/sync-runs":
            return httpx.Response(401, json={"detail": "unauthorized"})
        return httpx.Response(
            200,
            json={"status": "ready"},
            headers={key: "enabled" for key in verify_deployment.SECURITY_HEADERS},
        )

    client = httpx.Client(
        base_url="http://local.test", transport=httpx.MockTransport(respond)
    )
    monkeypatch.setattr(verify_deployment.httpx, "Client", lambda **kwargs: client)
    result = verify_deployment.verify("http://local.test")
    assert result["ready"]
    assert calls == [
        ("GET", "/"),
        ("GET", "/api/health"),
        ("GET", "/api/ready"),
        ("GET", "/api/admin/sync-runs"),
    ]
