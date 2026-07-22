"""Authenticated PWA Web Push API."""

from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from starlette.concurrency import run_in_threadpool

from ..core.auth import AuthenticatedUser, require_user
from ..core.config import settings
from ..models.schemas import (
    NotificationPreferences,
    NotificationsResponse,
    OperationResponse,
    PushConfigResponse,
    PushSubscriptionRequest,
    PushUnsubscribeRequest,
    UserNotification,
)
from ..services import notifications as notification_service
from ..services import supabase_client

router = APIRouter()


@router.get("/notifications", response_model=NotificationsResponse)
async def notification_inbox(
    limit: int = 50, user: AuthenticatedUser = Depends(require_user)
):
    rows = await run_in_threadpool(
        supabase_client.list_user_notifications, user.id, min(max(limit, 1), 100)
    )
    return NotificationsResponse(
        notifications=[UserNotification(**row) for row in rows],
        unread_count=sum(1 for row in rows if not row.get("read_at")),
    )


@router.patch("/notifications/{notification_id}/read", response_model=OperationResponse)
async def mark_read(
    notification_id: str, user: AuthenticatedUser = Depends(require_user)
):
    changed = await run_in_threadpool(
        supabase_client.mark_notification_read, notification_id, user.id
    )
    if not changed:
        raise HTTPException(404, detail="ไม่พบการแจ้งเตือน")
    return OperationResponse(ok=True, message="อ่านแล้ว")


@router.post("/notifications/read-all", response_model=OperationResponse)
async def mark_all_read(user: AuthenticatedUser = Depends(require_user)):
    count = await run_in_threadpool(
        supabase_client.mark_all_notifications_read, user.id
    )
    return OperationResponse(ok=True, message=f"ทำเครื่องหมายอ่านแล้ว {count} รายการ")


@router.get("/notifications/config", response_model=PushConfigResponse)
async def push_config():
    enabled = bool(settings.push_enabled and settings.vapid_public_key)
    return PushConfigResponse(
        enabled=enabled,
        public_key=settings.vapid_public_key if enabled else None,
    )


@router.post("/notifications/subscriptions", response_model=OperationResponse)
async def subscribe(
    body: PushSubscriptionRequest,
    user: AuthenticatedUser = Depends(require_user),
):
    await run_in_threadpool(
        supabase_client.upsert_push_subscription,
        {
            "id": str(uuid4()),
            "user_id": user.id,
            "endpoint": body.endpoint,
            "p256dh": body.keys.p256dh,
            "auth_secret": body.keys.auth,
            "user_agent": body.user_agent,
            "active": True,
            "updated_at": datetime.now(UTC).isoformat(),
        },
    )
    return OperationResponse(ok=True, message="เปิด Web Push แล้ว")


@router.delete("/notifications/subscriptions", response_model=OperationResponse)
async def unsubscribe(
    body: PushUnsubscribeRequest,
    user: AuthenticatedUser = Depends(require_user),
):
    await run_in_threadpool(
        supabase_client.deactivate_push_subscription, body.endpoint, user.id
    )
    return OperationResponse(ok=True, message="ปิด Web Push แล้ว")


@router.get("/notifications/preferences", response_model=NotificationPreferences)
async def get_preferences(user: AuthenticatedUser = Depends(require_user)):
    row = await run_in_threadpool(supabase_client.get_notification_preferences, user.id)
    return NotificationPreferences(**(row or {}))


@router.put("/notifications/preferences", response_model=NotificationPreferences)
async def update_preferences(
    body: NotificationPreferences,
    user: AuthenticatedUser = Depends(require_user),
):
    row = await run_in_threadpool(
        supabase_client.upsert_notification_preferences,
        user.id,
        body.model_dump(),
    )
    return NotificationPreferences(**row)


@router.post("/notifications/test", response_model=OperationResponse)
async def test_notification(user: AuthenticatedUser = Depends(require_user)):
    delivered = await run_in_threadpool(
        notification_service.send_to_user,
        user.id,
        {
            "title": "ClearPath พร้อมแจ้งเตือน",
            "body": "อุปกรณ์นี้จะรับการแจ้งเตือนตามพื้นที่และเกณฑ์ที่เลือก",
            "url": "/",
            "tag": f"test-{user.id}",
        },
    )
    if delivered == 0:
        raise HTTPException(422, detail="ไม่พบ subscription ที่ส่งได้")
    return OperationResponse(ok=True, message="ส่งการแจ้งเตือนทดสอบแล้ว")
