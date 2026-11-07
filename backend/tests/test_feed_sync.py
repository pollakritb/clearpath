import asyncio
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from fastapi import HTTPException
from fastapi.responses import Response

from backend.core.config import settings
from backend.routers import community, cron
from backend.services import feed_sync, fire_feed, google_news, store_feeds


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setattr(settings, "external_feed_storage_enabled", True)
    monkeypatch.setattr(settings, "local_demo_mode", False)
    monkeypatch.setattr(settings, "google_news_enabled", True)
    monkeypatch.setattr(settings, "firms_map_key", "private-map-key")


def test_scheduler_is_disabled_before_rollout(monkeypatch):
    monkeypatch.setattr(settings, "external_feed_storage_enabled", False)
    assert asyncio.run(feed_sync.run()) == {"status": "disabled"}


def test_cron_auth_runs_before_any_ingestion(monkeypatch):
    monkeypatch.setattr(settings, "cron_secret", "private-token")
    monkeypatch.setattr(settings, "supabase_cron_secret", "")
    with pytest.raises(HTTPException) as exc:
        asyncio.run(cron.cron_external_feeds("Bearer wrong"))
    assert exc.value.status_code == 401


def test_scheduler_preserves_independent_sources_and_redacts_errors(
    monkeypatch, caplog
):
    finished = {}
    monkeypatch.setattr(store_feeds, "claim", lambda *_: {"status": "claimed"})
    monkeypatch.setattr(
        store_feeds,
        "state",
        lambda _: {"last_success_at": datetime.now(UTC).isoformat()},
    )

    def finish(source, _token, payload):
        finished[source] = payload
        return {"status": "success" if payload["ok"] else "failed"}

    async def failed_news(_validators):
        raise httpx.ConnectError("secret=do-not-log")

    async def fires(_days, *, force=False):
        assert force
        return [
            {
                "lat": 18.7883,
                "lon": 98.9853,
                "acquired_at": datetime.now(UTC).isoformat(),
            }
        ]

    monkeypatch.setattr(store_feeds, "finish", finish)
    monkeypatch.setattr(google_news, "fetch_for_sync", failed_news)
    monkeypatch.setattr(feed_sync.firms, "get_fires", fires)
    result = asyncio.run(feed_sync.run())
    assert not result["ok"]
    assert finished["google_news"] == {"ok": False, "error_code": "ConnectError"}
    assert len(finished["nasa_firms"]["snapshot"]["fires"]) == 1
    assert "do-not-log" not in caplog.text


def test_not_due_never_calls_upstream_and_reports_overdue(monkeypatch, caplog):
    monkeypatch.setattr(store_feeds, "claim", lambda *_: {"status": "not_due"})
    monkeypatch.setattr(
        store_feeds,
        "state",
        lambda _: {
            "first_attempt_at": (datetime.now(UTC) - timedelta(hours=4)).isoformat()
        },
    )
    monkeypatch.setattr(
        google_news, "fetch_for_sync", lambda *_: pytest.fail("not due")
    )
    result = asyncio.run(feed_sync.run())
    assert result["feeds"]["google_news"]["overdue"] is True
    assert "external_feed_overdue" in caplog.text


def test_stored_hotspots_expire_even_without_another_successful_sync(monkeypatch):
    now = datetime(2026, 11, 7, 8, tzinfo=UTC)
    monkeypatch.setattr(
        store_feeds,
        "state",
        lambda _: {
            "last_success_at": (now - timedelta(hours=1)).isoformat(),
            "checked_at": (now - timedelta(hours=1)).isoformat(),
            "last_error": "TimeoutException",
            "snapshot": {
                "fires": [
                    {
                        "lat": 18.7883,
                        "lon": 98.9853,
                        "acquired_at": (now - timedelta(hours=1)).isoformat(),
                    },
                    {
                        "lat": 7.88,
                        "lon": 98.35,
                        "acquired_at": (now - timedelta(hours=13)).isoformat(),
                    },
                ]
            },
        },
    )
    result = asyncio.run(fire_feed.get_public_fires(1, now=now))
    assert result.status == "unavailable"
    assert len(result.fires) == 1
    assert result.checked_at == (now - timedelta(hours=1)).isoformat()


def test_stored_news_api_reads_database_only_and_paginates(monkeypatch):
    now = datetime.now(UTC)
    rows = [
        {
            "id": f"news-{i:02}",
            "title": f"PM2.5 {i}",
            "source_name": "News",
            "source_url": "https://example.com",
            "published_at": (now - timedelta(minutes=i)).isoformat(),
            "first_seen_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }
        for i in range(25)
    ]
    monkeypatch.setattr(community.supabase_client, "get_announcements", lambda: [])
    monkeypatch.setattr(store_feeds, "news", lambda limit: rows[:limit])
    monkeypatch.setattr(
        store_feeds, "state", lambda _: {"last_success_at": now.isoformat()}
    )
    monkeypatch.setattr(
        google_news,
        "fetch_latest",
        lambda: pytest.fail("public GET must never fetch upstream"),
    )
    page1 = asyncio.run(community.announcements(Response(), offset=0, limit=10))
    page2 = asyncio.run(
        community.announcements(Response(), offset=page1.next_offset, limit=10)
    )
    assert len(page1.announcements) == 10
    assert not (
        {x.id for x in page1.announcements} & {x.id for x in page2.announcements}
    )
    assert page1.sync_status == "ready"
    assert page1.checked_at == now.isoformat()
    page3 = asyncio.run(
        community.announcements(Response(), offset=page2.next_offset, limit=10)
    )
    assert len(page3.announcements) == 5
    assert not page3.has_more


def test_rss_conditional_get_and_304(monkeypatch):
    received = []
    url = google_news._feed_url()

    def handler(request):
        received.append(request)
        return httpx.Response(304, headers={"ETag": "same"})

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        google_news.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs),
    )
    result = asyncio.run(
        google_news.fetch_for_sync(
            {"url": url, "etag": "same", "last_modified": "yesterday"}
        )
    )
    assert result["not_modified"]
    assert received[0].headers["If-None-Match"] == "same"
    assert received[0].headers["If-Modified-Since"] == "yesterday"


def test_rss_query_change_does_not_reuse_validators(monkeypatch):
    received = []

    def handler(request):
        received.append(request)
        return httpx.Response(200, text="<rss><channel/></rss>")

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        google_news.httpx,
        "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs),
    )
    result = asyncio.run(
        google_news.fetch_for_sync({"url": "old-query", "etag": "old"})
    )
    assert not result["not_modified"]
    assert "If-None-Match" not in received[0].headers


def test_rss_does_not_truncate_to_five_items_and_filters_unsafe_links():
    now = datetime.now(UTC)
    from email.utils import format_datetime

    def item(i, link):
        return f"<item><title>PM2.5 {i}</title><link>{link}</link><guid>{i}</guid><source>News</source><pubDate>{format_datetime(now)}</pubDate></item>"

    xml = (
        "<rss><channel>"
        + "".join(item(i, f"https://example.com/{i}") for i in range(12))
        + item(99, "javascript:alert(1)")
        + "</channel></rss>"
    ).encode()
    assert len(google_news.parse_feed(xml, now=now)) == 12
