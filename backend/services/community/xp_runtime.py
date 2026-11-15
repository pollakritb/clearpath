"""Shared XP controls, RPC boundary and local-demo state; no domain imports."""

from __future__ import annotations

import logging
from threading import RLock
from time import monotonic

from backend.services import store_client

from ...core.config import settings
from ...core.errors import UpstreamError

logger = logging.getLogger("clearpath.xp")
_LOCK = RLock()
_ACCOUNTS: dict[str, dict] = {}
_EVENTS: list[dict] = []
_CLAIMS: dict[tuple[str, str], dict] = {}
_CONTROL_CACHE: tuple[str, float, dict] | None = None


def configured() -> bool:
    return settings.local_demo_mode or settings.community_xp_enabled


def enabled() -> bool:
    if settings.local_demo_mode:
        return True
    if not settings.community_xp_enabled:
        return False
    try:
        return bool(control()["enabled"])
    except UpstreamError:
        return False


def rpc(name: str, params: dict):
    try:
        return store_client.get_client().rpc(name, params).execute().data
    except Exception as exc:
        if getattr(exc, "message", "") in {
            "request_closed",
            "not_invited",
            "not_eligible",
            "xp_disabled",
        }:
            raise ValueError("คำขอนี้ไม่เปิดรับผู้ช่วยใหม่") from exc
        raise UpstreamError("ระบบคะแนนยังไม่พร้อม กรุณาลองอีกครั้ง") from exc


def control() -> dict:
    global _CONTROL_CACHE
    if settings.local_demo_mode:
        return dict(enabled=True, maintenance=False, reset_version="local-xp-v1")
    if not settings.community_xp_enabled:
        return dict(enabled=False, maintenance=False, reset_version="legacy")
    key = settings.supabase_url
    if (
        _CONTROL_CACHE
        and _CONTROL_CACHE[0] == key
        and monotonic() - _CONTROL_CACHE[1] < 2
    ):
        return dict(_CONTROL_CACHE[2])
    try:
        rows = (
            store_client.get_client()
            .table("community_xp_control")
            .select("enabled,maintenance,reset_version")
            .limit(1)
            .execute()
            .data
        )
        _CONTROL_CACHE = (key, monotonic(), rows[0])
        return dict(rows[0])
    except Exception as exc:
        raise UpstreamError("ตรวจสถานะระบบชุมชนไม่สำเร็จ") from exc
