"""Read-only load harness for an explicitly isolated localhost backend.

Never targets production. Defaults to 10/25/50 concurrent readers, ten minutes
per level. A local hostname does not prove its database is isolated: the explicit
--isolated-fixture flag attests that the operator configured a disposable DB and
disabled external delivery/collectors. Results are never production capacity.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import time
from pathlib import Path
from urllib.parse import urlsplit

import httpx

PATHS = ("/api/forecast-grid/metadata", "/api/forecast?lat=14&lon=100&hours=120")


def local_url(value: str) -> str:
    u = urlsplit(value)
    if (
        u.scheme != "http"
        or u.hostname not in {"127.0.0.1", "localhost", "::1"}
        or u.username
        or u.password
        or u.path not in {"", "/"}
        or u.query
        or u.fragment
    ):
        raise ValueError(
            "load tests require a loopback HTTP origin without credentials"
        )
    return value.rstrip("/")


def percentile(values, fraction):
    return (
        sorted(values)[max(0, math.ceil(len(values) * fraction) - 1)]
        if values
        else None
    )


async def level(base: str, concurrency: int, seconds: float) -> dict:
    latencies = []
    failures = 0
    deadline = time.monotonic() + seconds
    limits = httpx.Limits(
        max_connections=concurrency, max_keepalive_connections=concurrency
    )
    async with httpx.AsyncClient(
        base_url=base, timeout=5, limits=limits, follow_redirects=False
    ) as client:

        async def worker():
            nonlocal failures
            i = 0
            while time.monotonic() < deadline:
                start = time.monotonic()
                try:
                    response = await client.get(PATHS[i % len(PATHS)])
                    if response.status_code != 200:
                        failures += 1
                    else:
                        data = response.json()
                        # An unavailable fixture is not a successful forecast workload.
                        if (
                            not isinstance(data, dict)
                            or (
                                i % len(PATHS) == 0
                                and (
                                    data.get("status") != "ready"
                                    or not data.get("valid_times")
                                )
                            )
                            or (i % len(PATHS) != 0 and not data.get("points"))
                        ):
                            failures += 1
                except (httpx.HTTPError, ValueError):
                    failures += 1
                latencies.append((time.monotonic() - start) * 1000)
                i += 1
                await asyncio.sleep(0.1)

        await asyncio.gather(*(worker() for _ in range(concurrency)))
    p95 = percentile(latencies, 0.95)
    return {
        "readers": concurrency,
        "seconds": seconds,
        "requests": len(latencies),
        "failures": failures,
        "p50_ms": percentile(latencies, 0.5),
        "p95_ms": p95,
        "passed": bool(latencies) and failures / len(latencies) < 0.01 and p95 <= 2000,
    }


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--base-url", default="http://127.0.0.1:8000")
    p.add_argument("--isolated-fixture", action="store_true", required=True)
    p.add_argument("--seconds", type=float, default=600)
    p.add_argument("--readers", type=int, nargs="+", default=[10, 25, 50])
    p.add_argument("--output", type=Path, required=True)
    a = p.parse_args()
    base = local_url(a.base_url)
    if not 0 < a.seconds <= 600 or any(n < 1 or n > 50 for n in a.readers):
        p.error("bounded duration <=600s and readers 1..50 required")
    results = [asyncio.run(level(base, n, a.seconds)) for n in a.readers]
    a.output.write_text(
        json.dumps(
            {
                "scope": "isolated-localhost-only-not-production-capacity",
                "levels": results,
            },
            indent=2,
        )
    )
    print(
        json.dumps(
            {"output": str(a.output), "passed": all(r["passed"] for r in results)}
        )
    )
    raise SystemExit(0 if all(r["passed"] for r in results) else 1)


if __name__ == "__main__":
    main()
