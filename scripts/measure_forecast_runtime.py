"""Read-only deployed forecast latency/availability sampler with aggregate output."""

from __future__ import annotations

import argparse
import json
import time
from datetime import UTC, datetime
from statistics import median
from typing import Any

import httpx


def _percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, round((len(ordered) - 1) * fraction)))
    return round(ordered[index], 2)


def summarize(samples: list[dict[str, Any]], started_at: str, ended_at: str) -> dict:
    latencies = [float(sample["duration_ms"]) for sample in samples]
    successful = [sample for sample in samples if int(sample["status"]) == 200]
    fallback = [sample for sample in successful if sample.get("fallback_reason")]
    return {
        "ready": bool(samples) and len(successful) == len(samples),
        "started_at": started_at,
        "ended_at": ended_at,
        "sample_count": len(samples),
        "success_count": len(successful),
        "availability": len(successful) / len(samples) if samples else 0,
        "latency_ms": {
            "median": round(median(latencies), 2) if latencies else None,
            "p95": _percentile(latencies, 0.95),
            "p99": _percentile(latencies, 0.99),
            "max": round(max(latencies), 2) if latencies else None,
        },
        "fallback_rate": len(fallback) / len(successful) if successful else None,
        "response_bytes": {
            "median": round(median([sample["bytes"] for sample in samples]), 2)
            if samples
            else None,
            "max": max((sample["bytes"] for sample in samples), default=None),
        },
        "status_counts": {
            str(status): sum(1 for sample in samples if sample["status"] == status)
            for status in sorted({sample["status"] for sample in samples})
        },
    }


def measure(base_url: str, request_count: int, timeout_seconds: float) -> dict:
    if not 5 <= request_count <= 200:
        raise ValueError("request_count_must_be_between_5_and_200")
    origin = base_url.rstrip("/")
    started_at = datetime.now(UTC).isoformat()
    samples: list[dict[str, Any]] = []
    with httpx.Client(base_url=origin, timeout=timeout_seconds) as client:
        current = client.get("/api/pm25/current")
        current.raise_for_status()
        stations = current.json().get("stations", [])
        station_ids = [str(row["id"]) for row in stations if row.get("id")]
        if not station_ids:
            raise ValueError("no_station_available")
        client.get("/api/forecast", params={"station_id": station_ids[0], "hours": 24})
        for index in range(request_count):
            before = time.perf_counter()
            response = client.get(
                "/api/forecast",
                params={
                    "station_id": station_ids[index % len(station_ids)],
                    "hours": 24,
                },
            )
            duration_ms = (time.perf_counter() - before) * 1000
            try:
                body = response.json()
            except ValueError:
                body = {}
            samples.append(
                {
                    "status": response.status_code,
                    "duration_ms": duration_ms,
                    "bytes": len(response.content),
                    "fallback_reason": body.get("fallback_reason"),
                }
            )
    return summarize(samples, started_at, datetime.now(UTC).isoformat())


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("base_url")
    parser.add_argument("--requests", type=int, default=30)
    parser.add_argument("--timeout-seconds", type=float, default=30)
    args = parser.parse_args()
    try:
        result = measure(args.base_url, args.requests, args.timeout_seconds)
    except (httpx.HTTPError, ValueError) as exc:
        result = {"ready": False, "error": type(exc).__name__}
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0 if result["ready"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
