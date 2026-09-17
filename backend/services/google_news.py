"""Read-only Google News RSS adapter with a one-hour in-process cache."""

import hashlib
import logging
from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from threading import Lock
from urllib.parse import urlencode
from xml.etree import ElementTree

import httpx

from ..core.config import settings

logger = logging.getLogger("clearpath.google-news")
GOOGLE_NEWS_RSS_URL = "https://news.google.com/rss/search"
MAX_FEED_BYTES = 2_000_000
MAX_ITEMS = 5

_cache_lock = Lock()
_cached_at: datetime | None = None
_cached_items: list[dict] = []


def _feed_url() -> str:
    return f"{GOOGLE_NEWS_RSS_URL}?{urlencode({'q': settings.google_news_query, 'hl': 'th', 'gl': 'TH', 'ceid': 'TH:th'})}"


def _text(item: ElementTree.Element, tag: str) -> str:
    return (item.findtext(tag) or "").strip()


def parse_feed(xml: bytes, *, now: datetime | None = None) -> list[dict]:
    """Parse only feed metadata; article bodies are never copied or stored."""
    if len(xml) > MAX_FEED_BYTES:
        raise ValueError("google_news_feed_too_large")
    root = ElementTree.fromstring(xml)
    current = now or datetime.now(UTC)
    cutoff = current - timedelta(days=7)
    results: list[dict] = []
    seen: set[str] = set()
    for item in root.findall("./channel/item"):
        title = _text(item, "title")
        link = _text(item, "link")
        guid = _text(item, "guid") or link
        source_node = item.find("source")
        source_name = (
            (source_node.text or "").strip() if source_node is not None else ""
        )
        published_raw = _text(item, "pubDate")
        if not title or not link or not guid or not published_raw:
            continue
        try:
            published = parsedate_to_datetime(published_raw)
            if published.tzinfo is None:
                published = published.replace(tzinfo=UTC)
            published = published.astimezone(UTC)
        except (TypeError, ValueError, OverflowError):
            continue
        if published < cutoff or published > current + timedelta(minutes=10):
            continue
        fingerprint = hashlib.sha256(guid.encode("utf-8")).hexdigest()[:24]
        if fingerprint in seen:
            continue
        seen.add(fingerprint)
        results.append(
            {
                "id": f"google-news-{fingerprint}",
                "title": title,
                "body": "เปิดอ่านรายละเอียดจากสำนักข่าวต้นฉบับ",
                "kind": "news",
                "area": "ประเทศไทย",
                "published_at": published.isoformat(),
                "expires_at": None,
                "status": "published",
                "image_url": None,
                "source_name": source_name or "Google News",
                "source_url": link,
                "external": True,
                "created_at": None,
                "updated_at": None,
            }
        )
        if len(results) >= MAX_ITEMS:
            break
    return results


async def fetch_latest(*, force: bool = False) -> list[dict]:
    global _cached_at, _cached_items
    if not settings.google_news_enabled or settings.local_demo_mode:
        return []
    now = datetime.now(UTC)
    with _cache_lock:
        if (
            not force
            and _cached_at is not None
            and now - _cached_at < timedelta(seconds=settings.google_news_cache_seconds)
        ):
            return [dict(item) for item in _cached_items]
    try:
        async with httpx.AsyncClient(
            timeout=10,
            follow_redirects=True,
            headers={
                "User-Agent": "ClearPath/1.0 (+https://clearpath-gray.vercel.app)"
            },
        ) as client:
            response = await client.get(_feed_url())
            response.raise_for_status()
        items = parse_feed(response.content, now=now)
    except (httpx.HTTPError, ElementTree.ParseError, ValueError):
        logger.warning("google_news_fetch_failed", exc_info=True)
        with _cache_lock:
            return [dict(item) for item in _cached_items]
    with _cache_lock:
        _cached_at = now
        _cached_items = items
    return [dict(item) for item in items]


def clear_cache() -> None:
    global _cached_at, _cached_items
    with _cache_lock:
        _cached_at = None
        _cached_items = []
