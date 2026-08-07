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


def baseline_fallback_valid(
    *, current_status: int, forecast_status: int | None, forecast: dict
) -> bool:
    points = forecast.get("points", [])
    return bool(
        current_status == 200
        and forecast_status == 200
        and forecast.get("model_version") is None
        and forecast.get("artifact_sha256") is None
        and "ml_forecast_disabled" in forecast.get("fallback_reason_codes", [])
        and points
        and all(
            point.get("model_version") is None and point.get("artifact_sha256") is None
            for point in points
        )
    )


def verify(base_url: str, *, expect_baseline_fallback: bool = False) -> dict:
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
    if expect_baseline_fallback and checks["readiness"]:
        with httpx.Client(
            base_url=origin, timeout=30, follow_redirects=True
        ) as fallback_client:
            current = fallback_client.get("/api/pm25/current")
            try:
                stations = current.json().get("stations", [])
            except (AttributeError, ValueError):
                stations = []
            forecast = (
                fallback_client.get(
                    "/api/forecast",
                    params={"station_id": stations[0]["id"], "hours": 24},
                )
                if stations
                else None
            )
        try:
            forecast_body = forecast.json() if forecast is not None else {}
        except ValueError:
            forecast_body = {}
        points = forecast_body.get("points", [])
        checks["baseline_fallback"] = baseline_fallback_valid(
            current_status=current.status_code,
            forecast_status=forecast.status_code if forecast is not None else None,
            forecast=forecast_body,
        )
        details["baseline_fallback"] = {
            "current_status": current.status_code,
            "forecast_status": forecast.status_code if forecast is not None else None,
            "method": forecast_body.get("method"),
            "fallback_reason_codes": forecast_body.get("fallback_reason_codes", []),
            "point_count": len(points),
        }
    result_ready = all(checks.values())
    return {"ready": result_ready, "checks": checks, "details": details}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("base_url", help="Example: https://clearpath.example")
    parser.add_argument(
        "--expect-baseline-fallback",
        action="store_true",
        help="Verify ML is disabled and all forecast points expose baseline metadata.",
    )
    args = parser.parse_args()
    try:
        result = verify(
            args.base_url,
            expect_baseline_fallback=args.expect_baseline_fallback,
        )
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
