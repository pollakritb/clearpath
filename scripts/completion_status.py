"""Read-only baseline of local source and public deployed readiness. No credentials."""

import argparse
import json
import os
import subprocess
import urllib.error
import urllib.request
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlsplit


def snapshot(origin: str | None = None) -> dict:
    result = {
        "checked_at": datetime.now(UTC).isoformat(),
        "source_commit": subprocess.check_output(
            ["git", "rev-parse", "HEAD"], text=True
        ).strip(),
        "working_tree_changed": bool(
            subprocess.check_output(["git", "status", "--porcelain"], text=True).strip()
        ),
        "migration_files": sorted(
            p.name for p in Path("supabase/migrations").glob("*.sql")
        ),
        "probes": {},
    }
    if origin:
        url = urlsplit(origin)
        if (
            url.scheme not in {"http", "https"}
            or not url.hostname
            or url.username
            or url.password
            or url.query
            or url.fragment
            or url.path not in {"", "/"}
        ):
            raise ValueError(
                "origin must be an HTTP origin without credentials/path/query"
            )
        for path in [
            "/api/health",
            "/api/ready",
            "/api/forecast-grid/metadata",
            "/api/community/leaderboard?period=month",
        ]:
            try:
                with urllib.request.urlopen(
                    origin.rstrip("/") + path, timeout=20
                ) as response:
                    body = json.load(response)
                allowed = {
                    "status",
                    "release",
                    "environment",
                    "station_count",
                    "fresh_station_count",
                    "expired_station_count",
                    "generation_id",
                    "retrieved_at",
                    "stale",
                    "launched_at",
                    "month",
                    "provisional",
                    "coverage_status",
                    "future_time_count",
                    "future_horizon_hours",
                }
                data = {k: v for k, v in body.items() if k in allowed}
                if "valid_times" in body:
                    from backend.algorithms.forecast_horizon import forecast_horizon

                    data.update(
                        forecast_horizon(body["valid_times"], datetime.now(UTC))
                    )
                result["probes"][path] = {"status": response.status, "data": data}
            except urllib.error.HTTPError as error:
                result["probes"][path] = {"status": error.code}
            except Exception as error:
                result["probes"][path] = {"error_type": type(error).__name__}
    return result


def private_json(path: Path, value: dict):
    # Refuse to overwrite a baseline or follow an existing symlink.
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, "w") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2)


def main():
    import sys

    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    value = snapshot(args.origin)
    private_json(args.output, value)
    print(
        json.dumps(
            {
                "baseline_saved": True,
                "source_commit": value["source_commit"],
                "probe_count": len(value["probes"]),
            }
        )
    )


if __name__ == "__main__":
    main()
