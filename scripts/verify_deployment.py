"""Read-only smoke test for a deployed ClearPath origin."""

from __future__ import annotations

import argparse
import json

import httpx

SECURITY_HEADERS = (
    "content-security-policy",
    "referrer-policy",
    "x-content-type-options",
    "x-frame-options",
    "permissions-policy",
)


def verify(base_url: str) -> dict:
    origin = base_url.rstrip("/")
    checks: dict[str, bool] = {}
    details: dict[str, object] = {}
    with httpx.Client(base_url=origin, timeout=30, follow_redirects=True) as client:
        home = client.get("/")
        health = client.get("/api/health")
        ready = client.get("/api/ready")
        admin = client.get("/api/admin/sync-runs")
    checks["home"] = home.status_code == 200
    checks["health"] = health.status_code == 200
    checks["readiness"] = ready.status_code == 200
    checks["admin_requires_auth"] = admin.status_code == 401
    checks["security_headers"] = all(
        header in home.headers for header in SECURITY_HEADERS
    )
    checks["hsts"] = not origin.startswith("https://") or (
        "strict-transport-security" in home.headers
    )
    try:
        readiness_body = ready.json()
    except ValueError:
        readiness_body = None
    details.update(
        {
            "home_status": home.status_code,
            "health_status": health.status_code,
            "readiness_status": ready.status_code,
            "admin_status": admin.status_code,
            "readiness": readiness_body,
            "missing_security_headers": [
                header for header in SECURITY_HEADERS if header not in home.headers
            ],
        }
    )
    result_ready = all(checks.values())
    return {"ready": result_ready, "checks": checks, "details": details}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("base_url", help="Example: https://clearpath.example")
    args = parser.parse_args()
    try:
        result = verify(args.base_url)
    except httpx.HTTPError as exc:
        result = {
            "ready": False,
            "checks": {},
            "details": {"network_error_type": type(exc).__name__},
        }
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if result["ready"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
