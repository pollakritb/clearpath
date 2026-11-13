"""Durable owner-authorized Auth closure; cron retries failed external operations.

The database transaction captures the private draft-media manifest before writes
are blocked. Auth removal is idempotent; completion is verified in PostgreSQL.
No public request or Administrator endpoint accepts a target identity.
"""

import logging

from ..core.config import settings
from . import supabase_client as db

logger = logging.getLogger("clearpath.account_erasure")


def process(*, request_id: str | None = None) -> dict:
    if settings.local_demo_mode or not settings.account_privacy_enabled:
        return {"processed": 0, "failed": 0}
    client = db.get_client()
    try:
        jobs = (
            client.rpc(
                "pending_account_erasures", {"p_limit": 10, "p_request": request_id}
            )
            .execute()
            .data
            or []
        )
    except Exception:
        logger.warning("account_erasure_queue_unavailable")
        return {"processed": 0, "failed": 1}
    result = {"processed": 0, "failed": 0}
    for job in jobs:
        try:
            paths = job.get("image_paths") or []
            for start in range(0, len(paths), 100):
                client.storage.from_(settings.report_image_bucket).remove(
                    paths[start : start + 100]
                )
            if job.get("auth_user_id"):
                try:
                    client.auth.admin.delete_user(job["auth_user_id"])
                except Exception as exc:
                    # A prior attempt can remove Auth and lose its HTTP response.
                    if getattr(exc, "status", None) != 404:
                        raise
            row = (
                client.rpc("complete_account_erasure", {"p_request": job["request_id"]})
                .execute()
                .data
            )
            result["processed"] += 1
            if request_id:
                result["request"] = row
        except Exception:
            # Do not log identities, tokens, private paths or upstream exception
            # bodies. Keep the job intact for the next protected cron invocation.
            logger.warning("account_erasure_retry_required")
            result["failed"] += 1
    return result
