"""Lease-protected scheduled RSS/FIRMS ingestion, independent of web visitors."""

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from starlette.concurrency import run_in_threadpool

from ..algorithms.hotspot_policy import public_hotspot_state
from ..algorithms.thailand_boundary import is_in_thailand
from ..core.config import settings
from . import firms, google_news, store_feeds

logger = logging.getLogger("clearpath.external-feeds")


async def _sync(source: str) -> dict:
    if source == "google_news" and not settings.google_news_enabled:
        return {"status": "disabled"}
    if source == "nasa_firms" and not settings.firms_map_key:
        return {"status": "unconfigured"}
    token = str(uuid4())
    claim = await run_in_threadpool(store_feeds.claim, source, token)
    if claim.get("status") != "claimed":
        return claim
    try:
        if source == "google_news":
            payload = await asyncio.wait_for(
                google_news.fetch_for_sync(claim.get("validators")), timeout=25
            )
        else:
            state = public_hotspot_state(
                await asyncio.wait_for(firms.get_fires(1, force=True), timeout=25),
                area_contains=is_in_thailand,
            )
            payload = {"snapshot": state, "received_count": len(state["fires"])}
        payload["ok"] = True
        return await run_in_threadpool(store_feeds.finish, source, token, payload)
    except Exception as exc:
        # Only a fixed exception type is persisted: upstream URLs may contain keys.
        logger.warning(
            "external_feed_failed source=%s code=%s", source, type(exc).__name__
        )
        return await run_in_threadpool(
            store_feeds.finish,
            source,
            token,
            {"ok": False, "error_code": type(exc).__name__},
        )


async def run() -> dict:
    if not settings.external_feed_storage_enabled or settings.local_demo_mode:
        return {"status": "disabled"}
    sources = ("google_news", "nasa_firms")
    results = await asyncio.gather(
        *(_sync(source) for source in sources), return_exceptions=True
    )
    feeds = {}
    for source, result in zip(sources, results, strict=True):
        if isinstance(result, BaseException):
            logger.error(
                "external_feed_storage_failed source=%s code=%s",
                source,
                type(result).__name__,
            )
            feeds[source] = {"status": "failed", "error_code": "storage_unavailable"}
        else:
            feeds[source] = result
        if feeds[source]["status"] in {"disabled", "unconfigured"}:
            continue
        try:
            state = await run_in_threadpool(store_feeds.state, source)
            last = state.get("last_success_at") or state.get("first_attempt_at")
            if last:
                age = datetime.now(UTC) - datetime.fromisoformat(
                    str(last).replace("Z", "+00:00")
                )
                overdue = age >= timedelta(hours=3)
                feeds[source]["overdue"] = overdue
                if overdue:
                    logger.error(
                        "external_feed_overdue source=%s last_success_at=%s",
                        source,
                        state.get("last_success_at"),
                    )
        except Exception:
            logger.error("external_feed_health_unavailable source=%s", source)
    return {
        "ok": all(value["status"] != "failed" for value in feeds.values()),
        "feeds": feeds,
    }
