"""VPS replacement for the CAMS GitHub collector, using only the local API.

Run by a systemd timer with CRON_SECRET in EnvironmentFile. The primary
Air4Thai/Trust/community schedules remain in Supabase; this does not duplicate them.
"""

from __future__ import annotations

import json
import os
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def collect() -> None:
    secret = os.environ["CRON_SECRET"]

    def invoke(path: str, retries: int = 0) -> dict:
        request = Request(
            "http://127.0.0.1:18080" + path,
            headers={"Authorization": f"Bearer {secret}"},
        )
        for attempt in range(retries + 1):
            try:
                with urlopen(request, timeout=70) as response:
                    return json.load(response)
            except (URLError, TimeoutError) as exc:
                if attempt == retries or (
                    isinstance(exc, HTTPError) and exc.code < 500
                ):
                    raise
                time.sleep(3)
        raise RuntimeError("Request retry budget exhausted")

    # Preserve the existing production workflow: six station batches, then grid.
    snapshot_failed = False
    try:
        for batch in range(6):
            result = invoke(f"/api/cron/cams-snapshots?batch_index={batch}")
            status = result.get("status")
            print(
                json.dumps({"job": "snapshots", "batch": batch, "status": status}),
                flush=True,
            )
            if status not in {"success", "partial", "not_due", "retired"}:
                raise RuntimeError("Unexpected CAMS snapshot status")
    except (URLError, TimeoutError, RuntimeError, ValueError) as exc:
        snapshot_failed = True
        print(json.dumps({"job": "snapshots", "error": type(exc).__name__}), flush=True)
    if not snapshot_failed:
        time.sleep(60)
    for _ in range(80):
        result = invoke("/api/cron/cams-grid", retries=2)
        status = result.get("status")
        print(
            json.dumps(
                {
                    "job": "grid",
                    "status": status,
                    "completed_batches": result.get("completed_batches"),
                    "batch_count": result.get("batch_count"),
                }
            ),
            flush=True,
        )
        if status in {"ready", "not_due"}:
            if snapshot_failed:
                raise RuntimeError("Snapshot collection failed; grid completed")
            return
        if status not in {"collecting", "in_progress"}:
            raise RuntimeError("Unexpected CAMS grid status")
        time.sleep(6)
    raise RuntimeError("CAMS grid checkpoint budget exhausted")


if __name__ == "__main__":
    collect()
