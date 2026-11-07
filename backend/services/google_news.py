"""Google News RSS metadata adapter; scheduled storage is the production path."""

import hashlib
import logging
from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from threading import Lock
from urllib.parse import urlencode, urlsplit
from xml.etree import ElementTree

import httpx

from ..core.config import settings

logger = logging.getLogger("clearpath.google-news")
GOOGLE_NEWS_RSS_URL = "https://news.google.com/rss/search"
MAX_FEED_BYTES = 2_000_000

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
    if root.tag != "rss" or root.find("channel") is None:
        raise ValueError("google_news_invalid_rss")
    current = now or datetime.now(UTC)
    cutoff = current - timedelta(days=7)
    results: list[dict] = []
    seen: set[str] = set()
    seen_links: set[str] = set()
    for item in root.findall("./channel/item"):
        title = _text(item, "title")
        link = _text(item, "link")
        guid = _text(item, "guid") or link
        topic = title.lower().replace(" ", "")
        if not any(
            term in topic
            for term in (
                "pm2.5",
                "pm25",
                "ฝุ่น",
                "มลพิษ",
                "คุณภาพอากาศ",
                "หมอกควัน",
                "airpollution",
                "airquality",
                "haze",
                "smog",
            )
        ):
            continue
        source_node = item.find("source")
        source_name = (
            (source_node.text or "").strip() if source_node is not None else ""
        )
        published_raw = _text(item, "pubDate")
        try:
            parsed_link = urlsplit(link)
            safe_link = (
                parsed_link.scheme == "https"
                and bool(parsed_link.hostname)
                and not parsed_link.username
            )
        except ValueError:
            safe_link = False
        if (
            not title
            or len(title) > 2000
            or not source_name
            or len(source_name) > 500
            or not guid
            or not published_raw
            or not safe_link
        ):
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
        if fingerprint in seen or link in seen_links:
            continue
        seen.add(fingerprint)
        seen_links.add(link)
        results.append(
            {
                "id": f"google-news-{fingerprint}",
                "guid": guid,
                "title": title,
                "body": "เปิดอ่านรายละเอียดจากสำนักข่าวต้นฉบับ",
                "kind": "news",
                "area": "ไม่ระบุพื้นที่",
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

    return sorted(
        results, key=lambda row: (row["published_at"], row["id"]), reverse=True
    )


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


async def fetch_for_sync(validators: dict | None = None) -> dict:
    """Fetch once; failures propagate so the scheduler retains the last snapshot."""
    url = _feed_url()
    validators = validators or {}
    headers = {"User-Agent": "ClearPath/1.0 (+https://clearpath-gray.vercel.app)"}
    if validators.get("url") == url:
        if validators.get("etag"):
            headers["If-None-Match"] = validators["etag"]
        if validators.get("last_modified"):
            headers["If-Modified-Since"] = validators["last_modified"]
    async with (
        httpx.AsyncClient(timeout=12, follow_redirects=True) as client,
        client.stream("GET", url, headers=headers) as response,
    ):
        saved = {
            "url": url,
            "etag": response.headers.get(
                "etag",
                validators.get("etag")
                if response.status_code == 304 and validators.get("url") == url
                else None,
            ),
            "last_modified": response.headers.get(
                "last-modified",
                validators.get("last_modified")
                if response.status_code == 304 and validators.get("url") == url
                else None,
            ),
        }
        if response.status_code == 304:
            if validators.get("url") != url:
                raise ValueError("unexpected_not_modified")
            return {"items": [], "not_modified": True, "validators": saved}
        response.raise_for_status()
        content = bytearray()
        async for chunk in response.aiter_bytes():
            content.extend(chunk)
            if len(content) > MAX_FEED_BYTES:
                raise ValueError("google_news_feed_too_large")
    items = parse_feed(bytes(content))
    total = len(ElementTree.fromstring(content).findall("./channel/item"))
    return {
        "items": items,
        "not_modified": False,
        "validators": saved,
        "received_count": total,
        "filtered_count": total - len(items),
    }


def present_stored(row: dict) -> dict:
    """Present only metadata through the existing announcement contract."""
    return {
        "id": row["id"],
        "title": row["title"],
        "source_name": row["source_name"],
        "source_url": row["source_url"],
        "published_at": row["published_at"],
        "body": "เปิดอ่านรายละเอียดจากสำนักข่าวต้นฉบับ",
        "kind": "news",
        "area": None,
        "status": "published",
        "external": True,
        "created_at": row["first_seen_at"],
        "updated_at": row["updated_at"],
    }
