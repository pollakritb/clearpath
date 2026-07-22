"""Supabase Auth identity and role dependencies.

The API never accepts a user id supplied by a request body.  In local demo mode
only, an implicit administrator identity keeps the offline demo usable without
a Supabase project.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, HTTPException

from ..services import supabase_client
from .config import settings


@dataclass(frozen=True)
class AuthenticatedUser:
    id: str
    email: str | None
    role: str
    display_name: str | None = None


def _bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, detail="กรุณาเข้าสู่ระบบด้วยอีเมลก่อน")
    token = authorization[7:].strip()
    if not token:
        raise HTTPException(401, detail="access token ไม่ถูกต้อง")
    return token


def require_user(
    authorization: str | None = Header(default=None, alias="Authorization"),
) -> AuthenticatedUser:
    if settings.local_demo_mode and not authorization:
        profile = supabase_client.ensure_profile(
            "00000000-0000-0000-0000-000000000001",
            "Local Demo Admin",
            role="admin",
        )
        return AuthenticatedUser(
            id=str(profile["id"]),
            email="local@example.invalid",
            role="admin",
            display_name=profile.get("display_name"),
        )

    token = _bearer_token(authorization)
    try:
        auth_user = supabase_client.get_auth_user(token)
        metadata = auth_user.get("user_metadata") or {}
        display_name = metadata.get("display_name") or metadata.get("full_name")
        profile = supabase_client.ensure_profile(
            str(auth_user["id"]),
            str(display_name)[:80] if display_name else None,
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            401, detail="session หมดอายุหรือ access token ไม่ถูกต้อง"
        ) from exc

    return AuthenticatedUser(
        id=str(profile["id"]),
        email=auth_user.get("email"),
        role=str(profile.get("role") or "user"),
        display_name=profile.get("display_name"),
    )


def require_moderator(
    user: Annotated[AuthenticatedUser, Depends(require_user)],
) -> AuthenticatedUser:
    if user.role not in {"moderator", "admin"}:
        raise HTTPException(403, detail="ต้องมีสิทธิ์ผู้ตรวจสอบข้อมูล")
    return user


def require_admin(
    user: Annotated[AuthenticatedUser, Depends(require_user)],
) -> AuthenticatedUser:
    if user.role != "admin":
        raise HTTPException(403, detail="ต้องมีสิทธิ์ผู้ดูแลระบบ")
    return user
