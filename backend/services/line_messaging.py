"""LINE Messaging API adapter and one-time ClearPath account linking."""

from __future__ import annotations

import contextlib
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
from ..core.line_window import delivery_window_open
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


class LineProviderError(UpstreamError):
    def __init__(
        self,
        reason: str,
        *,
        retryable: bool = True,
        retry_after: float = 0,
        attempted: bool = True,
    ):
        super().__init__("LINE Messaging API ส่งข้อความไม่สำเร็จ")
        self.reason, self.retryable, self.retry_after, self.attempted = (
            reason,
            retryable,
            retry_after,
            attempted,
        )


def reserve_budget(url: str) -> None:
    if settings.line_durable_delivery_enabled:
        if settings.line_monthly_message_cap <= 0:
            raise ConfigurationError("ตั้งค่า LINE_MONTHLY_MESSAGE_CAP ก่อนเปิด worker")
        from . import store_client

        allowed = (
            store_client.get_client()
            .rpc(
                "reserve_line_budget",
                {
                    "p_endpoint": "push" if url == LINE_PUSH_URL else "reply",
                    "p_per_second": settings.line_requests_per_second,
                    "p_monthly_cap": settings.line_monthly_message_cap,
                },
            )
            .execute()
            .data
        )
        if not allowed:
            raise LineProviderError(
                "line_budget_deferred", retry_after=60, attempted=False
            )


def _post(
    url: str,
    payload: dict,
    retry_key: str | None = None,
    *,
    budget_reserved: bool = False,
) -> str | None:
    if not delivery_window_open():
        raise LineProviderError(
            "line_delivery_window_closed", retryable=False, attempted=False
        )
    try:
        headers = _headers()
        if not budget_reserved:
            reserve_budget(url)
        if retry_key:
            headers["X-Line-Retry-Key"] = retry_key
        response = httpx.post(url, json=payload, headers=headers, timeout=15.0)
        if (
            retry_key
            and response.status_code == 409
            and response.headers.get("x-line-accepted-request-id")
        ):
            return response.headers.get("x-line-accepted-request-id")
        if response.status_code >= 400:
            status = response.status_code
            retry_after = 0.0
            with contextlib.suppress(ValueError):
                retry_after = min(
                    86400, max(0, float(response.headers.get("retry-after", 0)))
                )
            quota = status == 429 and "monthly" in response.text.lower()
            raise LineProviderError(
                "line_monthly_quota" if quota else f"line_http_{status}",
                retryable=status == 429 or status >= 500,
                retry_after=max(retry_after, 3600 if quota else 0),
            )
        return response.headers.get("x-line-request-id")
    except httpx.HTTPError as exc:
        raise LineProviderError("line_network_error") from exc


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
    changed = supabase_client.deactivate_line_notification_link(user_id=user_id)
    supabase_client.upsert_notification_preferences(user_id, {"line_enabled": False})
    return changed


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
    supabase_client.upsert_notification_preferences(
        str(row["user_id"]),
        {
            "line_enabled": True,
            "consent_granted": True,
            "consent_granted_at": now,
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
    return process_events(payload.get("events") or [])


def process_events(events: list[dict]) -> dict:
    handled = linked = duplicates = 0
    for event in events:
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


def prepare_push(user_id: str, payload: dict) -> dict | None:
    row = supabase_client.get_line_notification_link(user_id)
    if not row or not row.get("active") or not row.get("line_user_id"):
        return None
    title = str(payload.get("title") or "ClearPath")
    body = str(payload.get("body") or "มีข้อมูลใหม่")
    url = str(payload.get("url") or "").strip()
    if url.startswith("/") and settings.app_public_url:
        url = f"{settings.app_public_url.rstrip('/')}{url}"
    elif not url.startswith("https://"):
        url = ""
    text = "\n".join(part for part in (title, body, url) if part)[:5000]
    return {"to": row["line_user_id"], "messages": [{"type": "text", "text": text}]}


def post_push(request: dict, retry_key: str) -> str | None:
    return _post(LINE_PUSH_URL, request, retry_key=retry_key, budget_reserved=True)


def send_to_user(user_id: str, payload: dict) -> int:
    if not settings.line_messaging_ready:
        raise ConfigurationError("LINE Messaging API ยังไม่เปิดใช้งาน")
    request = prepare_push(user_id, payload)
    if request is None:
        return 0
    _post(
        LINE_PUSH_URL,
        request,
        **(
            {"retry_key": str(payload["retry_key"])} if payload.get("retry_key") else {}
        ),
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
                "body": "แจ้งเฉพาะคำขอให้ช่วยวัด คำขอได้รับข้อมูลแล้ว และ PM2.5 เกินเกณฑ์ ตามการตั้งค่าของคุณ",
                "url": "/community",
            },
        )
    )
