"""Run dedicated workers: .venv/bin/python -m scripts.line_worker --once.

Multiple processes use the same fenced PostgreSQL queue and channel limiter.
No provider requests occur unless LINE_DURABLE_DELIVERY_ENABLED is explicitly on.
"""

import argparse
import json
import logging
import signal
import time

from backend.core.config import settings
from backend.services import air_alerts, line_delivery, store_client

log = logging.getLogger("clearpath.line_worker")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--once", action="store_true")
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
    if not settings.line_durable_delivery_enabled or settings.local_demo_mode:
        parser.error(
            "Enable durable delivery against the migrated local/staging database first"
        )
    stopped = False

    def stop(*_):
        nonlocal stopped
        stopped = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    last_pruned = 0.0
    while not stopped:
        started = time.monotonic()
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


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
