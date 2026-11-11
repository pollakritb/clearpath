"""Read-only release smoke; report upstream freshness independently."""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import urlopen


def assess(health: tuple[int, dict], ready: tuple[int, dict], release: str) -> dict:
    health_code, health_body = health
    ready_code, body = ready
    fresh = body.get("fresh_station_count")
    count = body.get("station_count")
    checks = body.get("checks")
    if not isinstance(checks, dict):
        checks = {}
    contract = (
        body.get("service") == "clearpath-api"
        and checks.get("source_of_truth") is True
        and isinstance(count, int)
        and not isinstance(count, bool)
        and count > 0
        and isinstance(fresh, int)
        and not isinstance(fresh, bool)
        and 0 <= fresh <= count
        and body.get("fresh_max_age_minutes") == 60
        and body.get("surface_max_age_minutes") == 90
    )
    current = (
        ready_code == 200
        and body.get("status") == "ready"
        and body.get("reason") is None
        and checks.get("station_data") is True
        and isinstance(fresh, int)
        and fresh > 0
    )
    stale = (
        ready_code == 503
        and body.get("status") == "not_ready"
        and body.get("reason") == "station_data_stale"
        and checks.get("station_data") is False
        and fresh == 0
    )
    deploy_ok = bool(
        health_code == 200
        and (health_body.get("ok") is True or health_body.get("status") == "ok")
        and release
        and body.get("release") == release
        and contract
        and (current or stale)
    )
    return {
        "deploy_ok": deploy_ok,
        "data_status": "fresh"
        if deploy_ok and current
        else "stale"
        if deploy_ok
        else "unknown",
        "release": body.get("release"),
        "station_count": count,
        "fresh_station_count": fresh,
        "reason": body.get("reason"),
    }


def read_json(url: str) -> tuple[int, dict]:
    try:
        response = urlopen(url, timeout=10)
    except HTTPError as exc:
        response = exc  # Preserve the legitimate 503 stale-data response.
    except (URLError, TimeoutError, OSError):
        return 0, {}
    with response:
        try:
            body = json.load(response)
        except (ValueError, UnicodeError, OSError):
            return response.status, {}
        return response.status, body if isinstance(body, dict) else {}


def poll(
    origin: str, release: str, *, attempts: int = 40, interval: float = 15
) -> dict:
    deadline = time.monotonic() + 14 * 60  # Leave headroom in the 15-minute job.
    result: dict = {}
    for attempt in range(1, attempts + 1):
        result = assess(
            read_json(origin + "/api/health"),
            read_json(origin + "/api/ready"),
            release,
        )
        result["attempt"] = attempt
        if result["deploy_ok"]:
            return result
        print(
            f"Attempt {attempt}/{attempts}: waiting for release/API contract",
            flush=True,
        )
        remaining = deadline - time.monotonic()
        if attempt == attempts or remaining <= 0:
            break
        time.sleep(min(interval, remaining))
    return result


def main() -> int:
    origin = os.environ.get("CLEARPATH_PRODUCTION_URL", "").rstrip("/")
    release = os.environ.get("EXPECTED_RELEASE", "")
    if not origin.startswith("https://") or not release:
        print("::error::Production HTTPS origin and expected release are required")
        return 1
    result = poll(origin, release)
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    if not result.get("deploy_ok"):
        print("::error::Production release/API verification failed")
        return 1
    if result["data_status"] == "stale":
        print(
            "::warning::Deployment verified; station observations are stale. Data readiness remains degraded."
        )
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with Path(summary).open("a") as output:
            output.write(
                f"Deployment: **verified**\n\nData freshness: **{result['data_status']}**\n\n"
                f"Fresh stations: {result['fresh_station_count']} / {result['station_count']}\n"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
