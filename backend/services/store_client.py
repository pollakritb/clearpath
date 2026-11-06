"""Supabase (PostgreSQL) — source of truth ของข้อมูลสถานี + ประวัติ

ใช้ service_role key (server only). ฟังก์ชันเป็น sync — เรียกผ่าน run_in_threadpool
ใน router ที่เป็น async
"""

from __future__ import annotations

import logging
import time
from collections.abc import Callable

import httpx

from supabase import Client, ClientOptions, create_client

from ..core.config import settings
from ..core.errors import ConfigurationError
from .identifier_client import IdentifierClient

_client: Client | None = None
_identifier_client: IdentifierClient | None = None
_READ_RETRY_DELAYS_SECONDS = (0.05, 0.15)
logger = logging.getLogger("clearpath.supabase")


def get_client() -> IdentifierClient:
    global _client, _identifier_client
    if _client is None:
        if not settings.has_supabase:
            raise ConfigurationError(
                "ยังไม่ได้ตั้งค่า Supabase (SUPABASE_URL / SERVICE_ROLE_KEY)"
            )
        http_client = httpx.Client(
            timeout=httpx.Timeout(20.0, connect=5.0),
            transport=httpx.HTTPTransport(http2=False, retries=2),
            follow_redirects=True,
        )
        _client = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key,
            options=ClientOptions(httpx_client=http_client),
        )
    if _identifier_client is None or _identifier_client.raw is not _client:
        _identifier_client = IdentifierClient(_client)
    return _identifier_client


def stable_identifier(entity: str, value: str) -> str:
    """Preserve legacy privacy, deduplication and signing namespaces."""
    if settings.local_demo_mode:
        return value
    client = get_client()
    if isinstance(client, IdentifierClient) and client.numeric():
        return str(client.identity(entity, value)["legacy_id"])
    return value


def _execute_read[T](operation: Callable[[], T]) -> T:
    """Retry transient transport failures for idempotent Supabase reads only."""

    for attempt in range(len(_READ_RETRY_DELAYS_SECONDS) + 1):
        try:
            return operation()
        except httpx.HTTPError:
            if attempt >= len(_READ_RETRY_DELAYS_SECONDS):
                raise
            logger.warning(
                "supabase_read_retry",
                extra={"attempt": attempt + 1},
            )
            time.sleep(_READ_RETRY_DELAYS_SECONDS[attempt])
    raise RuntimeError("supabase_read_retry_exhausted")  # pragma: no cover


def get_auth_user(access_token: str) -> dict:
    """Validate a Supabase access token without trusting client identity fields."""
    response = get_client().auth.get_user(access_token)
    user = response.user
    if user is None:
        raise ValueError("invalid auth user")
    # get_user above verifies this exact token with Supabase. Decoding here only
    # reads AMR from that verified token; it is never an authentication verifier.
    import base64
    import json
    from datetime import UTC, datetime

    from ..algorithms.authentication_time import authentication_time

    try:
        part = access_token.split(".")[1]
        claims = json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))
        authenticated_at = (
            authentication_time(claims, now=datetime.now(UTC))
            if isinstance(claims, dict) and claims.get("sub") == str(user.id)
            else None
        )
    except (ValueError, IndexError, TypeError):
        authenticated_at = None
    return {
        "id": str(user.id),
        "authenticated_at": authenticated_at,
        "email": user.email,
        "app_metadata": user.app_metadata or {},
        "user_metadata": user.user_metadata or {},
    }
