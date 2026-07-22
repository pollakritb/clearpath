"""Short-lived, one-time sessions for in-app camera evidence.

The signed token proves freshness and account binding.  A database record makes
the token single-use across Vercel instances.  It still is not forensic proof
that the photographed scene itself is genuine.
"""

from __future__ import annotations

import hashlib
import hmac
import time
from datetime import UTC, datetime
from uuid import uuid4

from ..core.config import settings
from ..core.errors import ConfigurationError
from . import supabase_client


def _secret() -> bytes:
    value = settings.effective_capture_secret
    if not value:
        raise ConfigurationError(
            "ยังไม่ได้ตั้งค่า CAPTURE_SESSION_SECRET หรือ server secret สำหรับลงนาม"
        )
    return value.encode("utf-8")


def issue_session(user_id: str, now: int | None = None) -> dict:
    issued_at = int(now if now is not None else time.time())
    session_id = str(uuid4())
    payload = f"{session_id}.{user_id}.{issued_at}"
    signature = hmac.new(_secret(), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    expires_at = issued_at + settings.capture_session_ttl_seconds
    supabase_client.create_capture_session(
        {
            "id": session_id,
            "user_id": user_id,
            "issued_at": datetime.fromtimestamp(issued_at, UTC).isoformat(),
            "expires_at": datetime.fromtimestamp(expires_at, UTC).isoformat(),
            "consumed_at": None,
        }
    )
    return {
        "token": f"{payload}.{signature}",
        "session_id": session_id,
        "issued_at": datetime.fromtimestamp(issued_at, UTC).isoformat(),
        "expires_at": datetime.fromtimestamp(expires_at, UTC).isoformat(),
    }


def verify_session(token: str, user_id: str, now: int | None = None) -> dict:
    try:
        session_id, token_user_id, issued_raw, supplied = token.rsplit(".", 3)
        issued_at = int(issued_raw)
    except (AttributeError, TypeError, ValueError) as exc:
        raise ValueError("camera session ไม่ถูกต้อง กรุณาถ่ายรูปใหม่") from exc

    if token_user_id != user_id:
        raise ValueError("camera session ไม่ได้ออกให้บัญชีนี้")

    payload = f"{session_id}.{token_user_id}.{issued_at}"
    expected = hmac.new(_secret(), payload.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, supplied):
        raise ValueError("camera session ไม่ถูกต้อง กรุณาถ่ายรูปใหม่")

    checked_at = int(now if now is not None else time.time())
    age = checked_at - issued_at
    if age < -30 or age > settings.capture_session_ttl_seconds:
        raise ValueError("รูปถ่ายเกินเวลาที่กำหนด กรุณาถ่ายใหม่ภายใน 5 นาที")
    stored = supabase_client.get_capture_session(session_id)
    if not stored or str(stored.get("user_id")) != user_id:
        raise ValueError("ไม่พบ camera session นี้")
    if stored.get("consumed_at"):
        raise ValueError("camera session นี้ถูกใช้แล้ว กรุณาถ่ายรูปใหม่")
    return {
        "session_id": session_id,
        "captured_at": datetime.fromtimestamp(issued_at, UTC).isoformat(),
        "age_seconds": max(0, age),
    }


def consume_session(session_id: str, user_id: str) -> None:
    if not supabase_client.consume_capture_session(session_id, user_id):
        raise ValueError("camera session นี้ถูกใช้แล้ว กรุณาถ่ายรูปใหม่")
