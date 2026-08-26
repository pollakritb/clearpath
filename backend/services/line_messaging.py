"""LINE Messaging API adapter and one-time ClearPath account linking."""

from __future__ import annotations

import json
import secrets
from datetime import UTC, datetime, timedelta

import httpx

from ..algorithms.line_security import (
    extract_link_code,
    hash_link_code,
    valid_line_signature,
    valid_line_user_id,
)
from ..core.config import settings
from ..core.errors import ConfigurationError, UpstreamError
from . import supabase_client

LINE_REPLY_URL = "https://api.line.me/v2/bot/message/reply"
LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push"
LINK_TTL_MINUTES = 10
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _headers() -> dict[str, str]:
    if not settings.line_messaging_ready:
        raise ConfigurationError("LINE Messaging API ยังไม่เปิดใช้งาน")
    return {
        "Authorization": f"Bearer {settings.line_channel_access_token}",
        "Content-Type": "application/json",
    }


def _post(url: str, payload: dict) -> None:
    try:
        response = httpx.post(url, json=payload, headers=_headers(), timeout=15.0)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise UpstreamError("LINE Messaging API ส่งข้อความไม่สำเร็จ") from exc


def config() -> dict:
    return {
        "enabled": settings.line_messaging_ready,
        "official_account_url": settings.line_official_account_url or None,
    }


def status(user_id: str) -> dict:
    row = supabase_client.get_line_notification_link(user_id)
    return {
        **config(),
        "linked": bool(row and row.get("active") and row.get("line_user_id")),
        "linked_at": row.get("linked_at") if row else None,
    }


def create_link_code(user_id: str) -> dict:
    if not settings.line_messaging_ready:
        raise ConfigurationError("LINE Messaging API ยังไม่เปิดใช้งาน")
    suffix = "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))
    code = f"CP-{suffix}"
    now = datetime.now(UTC)
    expires_at = now + timedelta(minutes=LINK_TTL_MINUTES)
    supabase_client.upsert_line_notification_link(
        user_id,
        {
            "link_code_hash": hash_link_code(code, settings.line_channel_secret),
            "link_code_expires_at": expires_at.isoformat(),
        },
    )
    return {
        "code": code,
        "expires_at": expires_at.isoformat(),
        "official_account_url": settings.line_official_account_url or None,
        "instruction": f"ส่งข้อความ {code} ไปที่บัญชี LINE Official ของ ClearPath",
    }


def disconnect(user_id: str) -> bool:
    return supabase_client.deactivate_line_notification_link(user_id=user_id)


def _reply(reply_token: str | None, text: str) -> None:
    if not reply_token:
        return
    _post(
        LINE_REPLY_URL,
        {"replyToken": reply_token, "messages": [{"type": "text", "text": text}]},
    )


def _link(code: str, line_user_id: str) -> bool:
    code_hash = hash_link_code(code, settings.line_channel_secret)
    row = supabase_client.get_line_notification_link_by_code(code_hash)
    if not row or not row.get("link_code_expires_at"):
        return False
    expires_at = datetime.fromisoformat(
        str(row["link_code_expires_at"]).replace("Z", "+00:00")
    )
    if expires_at < datetime.now(UTC):
        return False
    existing = supabase_client.get_line_notification_link_by_line_user(line_user_id)
    if existing and str(existing.get("user_id")) != str(row["user_id"]):
        return False
    now = datetime.now(UTC).isoformat()
    supabase_client.upsert_line_notification_link(
        str(row["user_id"]),
        {
            "line_user_id": line_user_id,
            "link_code_hash": None,
            "link_code_expires_at": None,
            "active": True,
            "linked_at": now,
        },
    )
    return True


def handle_webhook(body: bytes, signature: str) -> dict:
    if not settings.line_messaging_ready:
        raise ConfigurationError("LINE Messaging API ยังไม่เปิดใช้งาน")
    if not valid_line_signature(body, signature, settings.line_channel_secret):
        raise ValueError("ลายเซ็น LINE webhook ไม่ถูกต้อง")
    try:
        payload = json.loads(body)
    except json.JSONDecodeError as exc:
        raise ValueError("LINE webhook JSON ไม่ถูกต้อง") from exc
    if not isinstance(payload, dict) or not isinstance(payload.get("events", []), list):
        raise ValueError("LINE webhook JSON ไม่ถูกต้อง")
    handled = linked = duplicates = 0
    for event in payload.get("events") or []:
        if not isinstance(event, dict):
            continue
        event_id = str(event.get("webhookEventId") or "").strip()
        if event_id and not supabase_client.claim_line_webhook_event(event_id):
            duplicates += 1
            continue
        try:
            source = event.get("source") or {}
            line_user_id = str(source.get("userId") or "")
            if source.get("type") != "user" or not valid_line_user_id(line_user_id):
                continue
            event_type = event.get("type")
            if event_type == "unfollow":
                supabase_client.deactivate_line_notification_link(
                    line_user_id=line_user_id
                )
                handled += 1
                continue
            if event_type == "follow":
                _reply(
                    event.get("replyToken"),
                    "เพิ่มเพื่อน ClearPath สำเร็จแล้ว กลับไปที่เว็บเพื่อสร้างรหัสเชื่อมบัญชี แล้วส่งรหัสนั้นในแชตนี้",
                )
                handled += 1
                continue
            message = event.get("message") or {}
            if event_type != "message" or message.get("type") != "text":
                continue
            code = extract_link_code(str(message.get("text") or ""))
            if not code:
                _reply(
                    event.get("replyToken"),
                    "กรุณาสร้างรหัสเชื่อม LINE จากหน้าแจ้งเตือนใน ClearPath แล้วส่งรหัส CP-XXXXXXXX ที่นี่",
                )
                handled += 1
                continue
            success = _link(code, line_user_id)
            _reply(
                event.get("replyToken"),
                "เชื่อม LINE กับ ClearPath สำเร็จแล้ว"
                if success
                else "รหัสไม่ถูกต้องหรือหมดอายุ กรุณาสร้างรหัสใหม่จาก ClearPath",
            )
            handled += 1
            linked += int(success)
        except Exception:
            if event_id:
                supabase_client.release_line_webhook_event(event_id)
            raise
    return {"handled": handled, "linked": linked, "duplicates": duplicates}


def send_to_user(user_id: str, payload: dict) -> int:
    if not settings.line_messaging_ready:
        return 0
    row = supabase_client.get_line_notification_link(user_id)
    if not row or not row.get("active") or not row.get("line_user_id"):
        return 0
    title = str(payload.get("title") or "ClearPath")
    body = str(payload.get("body") or "มีข้อมูลใหม่")
    url = str(payload.get("url") or "").strip()
    if url.startswith("/") and settings.app_public_url:
        url = f"{settings.app_public_url.rstrip('/')}{url}"
    elif not url.startswith("https://"):
        url = ""
    text = "\n".join(part for part in (title, body, url) if part)[:5000]
    _post(
        LINE_PUSH_URL,
        {
            "to": row["line_user_id"],
            "messages": [{"type": "text", "text": text}],
        },
    )
    return 1


def send_test_to_user(user_id: str) -> bool:
    if not settings.line_messaging_ready:
        raise ConfigurationError("LINE Messaging API ยังไม่เปิดใช้งาน")
    if not status(user_id)["linked"]:
        return False
    return bool(
        send_to_user(
            user_id,
            {
                "title": "ClearPath เชื่อม LINE สำเร็จ",
                "body": "คุณจะได้รับข้อความตามพื้นที่และเกณฑ์แจ้งเตือนที่บันทึกไว้",
                "url": "/community",
            },
        )
    )
