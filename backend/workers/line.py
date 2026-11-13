"""Run dedicated workers: .venv/bin/python -m scripts.line_worker --once.

Multiple processes use the same fenced PostgreSQL queue and channel limiter.
No provider requests occur unless LINE_DURABLE_DELIVERY_ENABLED is explicitly on.
"""

import argparse
import json
import logging
import signal
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread

import httpx

from backend.core.config import settings
from backend.services import air_alerts, line_delivery, store_client

log = logging.getLogger("clearpath.line_worker")


def probe() -> dict:
    """Read-only: no claims, state transitions, retention or LINE sends."""
    metrics = store_client.get_client().rpc("line_delivery_metrics").execute().data
    result = {
        "database_ready": isinstance(metrics, dict),
        "durable_enabled": settings.line_durable_delivery_enabled,
        "line_token_present": bool(settings.line_channel_access_token),
        "pending": metrics.get("pending", 0),
        "webhook_pending": metrics.get("webhook_pending", 0),
    }
    if settings.line_channel_access_token:
        with httpx.Client(timeout=10) as client:
            headers = {"Authorization": "Bearer " + settings.line_channel_access_token}
            for path, name in (
                ("quota", "quota"),
                ("quota/consumption", "consumption"),
            ):
                response = client.get(
                    "https://api.line.me/v2/bot/message/" + path, headers=headers
                )
                result[name + "_http_status"] = response.status_code
                if response.is_success:
                    data = response.json()
                    result[name] = {
                        key: data[key]
                        for key in ("type", "value", "totalUsage")
                        if key in data
                    }
    return result


class WorkerHealth:
    def __init__(self):
        self.last_success = time.monotonic()
        self.ready = False
        self.stopping = False

    def healthy(self) -> bool:
        return (
            self.ready
            and not self.stopping
            and time.monotonic() - self.last_success < 180
        )

    def server(self, port: int) -> ThreadingHTTPServer:
        health = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                self.send_response(
                    200 if self.path == "/health" and health.healthy() else 503
                )
                self.end_headers()
                self.wfile.write(b"ok" if health.healthy() else b"not_ready")

            def log_message(self, *_):
                pass

        server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
        Thread(target=server.serve_forever, daemon=True).start()
        return server


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true")
    parser.add_argument(
        "--probe",
        action="store_true",
        help="Read-only hosting/database/LINE quota probe; never consume or send",
    )
    parser.add_argument("--health-port", type=int)
    parser.add_argument(
        "--metrics",
        action="store_true",
        help="Read aggregate queue state without sending",
    )
    parser.add_argument(
        "--role", choices=("all", "inbox", "evaluation", "outbox"), default="all"
    )
    args = parser.parse_args()
    if args.metrics:
        print(
            json.dumps(
                store_client.get_client().rpc("line_delivery_metrics").execute().data,
                ensure_ascii=False,
                default=str,
            )
        )
        return
    if not args.probe and (
        not settings.line_durable_delivery_enabled or settings.local_demo_mode
    ):
        parser.error(
            "Enable durable delivery against the migrated local/staging database first"
        )
    stopped = False
    health = WorkerHealth()
    server = health.server(args.health_port) if args.health_port else None

    def stop(*_):
        nonlocal stopped
        stopped = True
        health.stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    last_pruned = 0.0
    while not stopped:
        started = time.monotonic()
        if args.probe:
            try:
                result = probe()
                health.ready = result["database_ready"]
                health.last_success = time.monotonic()
                log.info("line_worker_probe=%s", json.dumps(result, sort_keys=True))
            except Exception as exc:
                health.ready = False
                log.error("line_worker_probe_failed type=%s", type(exc).__name__)
            if args.once:
                break
            for _ in range(300):
                if stopped:
                    break
                time.sleep(0.1)
            continue
        # Independent stages: a source/database failure must not starve replies
        # or previously persisted deliveries in another queue.
        for name, operation in (
            ("inbox", lambda: line_delivery.process_inbox(1)),
            (
                "evaluation",
                lambda: (
                    air_alerts.evaluate_batch(25)
                    if settings.push_enabled
                    else {"disabled": True}
                ),
            ),
            ("outbox", lambda: line_delivery.process_outbox(1)),
        ):
            if args.role not in ("all", name):
                continue
            try:
                log.info("%s=%s", name, operation())
                health.ready = True
                health.last_success = time.monotonic()
            except Exception:
                log.error("worker_stage_failed stage=%s", name)
        if started - last_pruned > 3600:
            try:
                store_client.get_client().rpc("prune_line_delivery_data").execute()
                last_pruned = started
            except Exception:
                log.error("worker_retention_failed")
        if args.once:
            break
        # Sleep in short increments to exit promptly on shutdown.
        for _ in range(10):
            if stopped:
                break
            time.sleep(0.1)
    if server:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
