"""Authenticated notification inbox and LINE settings API."""

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from starlette.concurrency import run_in_threadpool

from ..algorithms.nearest_air_alert import valid_location
from ..core.auth import AuthenticatedUser, require_user
from ..core.config import settings
from ..models.notifications import AlertLocationInput, AlertLocationStatus
from ..models.schemas import (
    LineLinkCodeResponse,
    LineNotificationStatus,
    NotificationPreferences,
    NotificationsResponse,
    OperationResponse,
    UserNotification,
)
from ..services import air_alerts, line_delivery, line_messaging, supabase_client
from ..services import notifications as notification_service

router = APIRouter()


def _location_status(point: dict | None) -> AlertLocationStatus:
    return AlertLocationStatus(
        status="missing"
        if not point
        else "ready"
        if valid_location(point, datetime.now(UTC))
        else "stale",
        observed_at=point.get("observed_at") if point else None,
        accuracy_m=point.get("accuracy_m") if point else None,
        version=point.get("version") if point else None,
    )


@router.get("/notifications/location", response_model=AlertLocationStatus)
async def get_alert_location(user: AuthenticatedUser = Depends(require_user)):
    return _location_status(await run_in_threadpool(air_alerts.location, user.id))


@router.put("/notifications/location", response_model=AlertLocationStatus)
async def set_alert_location(
    body: AlertLocationInput, user: AuthenticatedUser = Depends(require_user)
):
    if not await run_in_threadpool(
        supabase_client.take_rate_limit, user.id, "alert_location", 60, 6
    ):
        raise HTTPException(429, detail="กรุณารอก่อนอัปเดตตำแหน่งอีกครั้ง")
    try:
        point = await run_in_threadpool(
            air_alerts.save_location, user.id, body.model_dump(mode="json")
        )
    except ValueError as exc:
        raise HTTPException(422, detail=str(exc)) from exc
    return _location_status(point)


@router.delete("/notifications/location", response_model=OperationResponse)
async def delete_alert_location(user: AuthenticatedUser = Depends(require_user)):
    await run_in_threadpool(air_alerts.clear_location, user.id)
    return OperationResponse(ok=True, message="ลบตำแหน่งแจ้งเตือนแล้ว")


@router.get("/notifications", response_model=NotificationsResponse)
async def notification_inbox(
    limit: int = 50, user: AuthenticatedUser = Depends(require_user)
):
    rows = await run_in_threadpool(
        notification_service.inbox, user.id, min(max(limit, 1), 100)
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


@router.get("/notifications/preferences", response_model=NotificationPreferences)
async def get_preferences(user: AuthenticatedUser = Depends(require_user)):
    row = await run_in_threadpool(supabase_client.get_notification_preferences, user.id)
    return NotificationPreferences(**(row or {}))


@router.put("/notifications/preferences", response_model=NotificationPreferences)
async def update_preferences(
    body: NotificationPreferences,
    user: AuthenticatedUser = Depends(require_user),
):
    values = body.model_dump()
    values["pm25_threshold"] = max(37.6, values["pm25_threshold"])
    if values["consent_granted"] and not values.get("consent_granted_at"):
        values["consent_granted_at"] = datetime.now(UTC).isoformat()
    if not values["consent_granted"]:
        values["consent_granted_at"] = None
        values["line_enabled"] = False
        await run_in_threadpool(line_messaging.disconnect, user.id)
    if not values["consent_granted"] or not values["air_alerts"]:
        await run_in_threadpool(air_alerts.clear_location, user.id)
    row = await run_in_threadpool(
        supabase_client.upsert_notification_preferences,
        user.id,
        values,
    )
    return NotificationPreferences(**row)


async def require_notification_test_slot(
    user: AuthenticatedUser = Depends(require_user),
):
    status = await run_in_threadpool(line_messaging.status, user.id)
    if not status.get("linked"):
        raise HTTPException(422, detail="ยังไม่ได้เชื่อมบัญชี LINE")
    allowed = await run_in_threadpool(
        supabase_client.take_rate_limit, user.id, "line_test_shared", 60, 1
    )
    if not allowed:
        raise HTTPException(
            429,
            detail="ส่งข้อความทดสอบแล้ว กรุณารอ 60 วินาทีก่อนลองอีกครั้ง",
            headers={"Retry-After": "60"},
        )
    daily = await run_in_threadpool(
        supabase_client.take_rate_limit, user.id, "line_test_daily", 86400, 10
    )
    if not daily:
        raise HTTPException(
            429,
            detail="ส่งข้อความทดสอบครบ 10 ครั้งในรอบนี้แล้ว กรุณาลองใหม่ภายหลัง",
            headers={"Retry-After": "86400"},
        )
    return user


@router.post("/notifications/test", response_model=OperationResponse)
async def test_notification(
    user: AuthenticatedUser = Depends(require_notification_test_slot),
):
    delivered = await run_in_threadpool(
        notification_service.deliver_to_user,
        user.id,
        {
            "title": "ClearPath พร้อมแจ้งเตือน",
            "body": "LINE ที่เชื่อมไว้จะรับคำขอให้ช่วยวัด คำขอได้รับข้อมูลแล้ว และ PM2.5 เกินเกณฑ์ตามการตั้งค่า",
            "url": "/",
            "tag": f"test-{user.id}",
        },
        force=True,
    )
    if delivered == 0:
        raise HTTPException(422, detail="ไม่พบ LINE ที่เชื่อมไว้")
    return OperationResponse(ok=True, message="ส่งการแจ้งเตือนทดสอบแล้ว")


@router.get("/notifications/line", response_model=LineNotificationStatus)
async def line_status(user: AuthenticatedUser = Depends(require_user)):
    result = await run_in_threadpool(line_messaging.status, user.id)
    return LineNotificationStatus(**result)


@router.post("/notifications/line/link-code", response_model=LineLinkCodeResponse)
async def create_line_link_code(user: AuthenticatedUser = Depends(require_user)):
    result = await run_in_threadpool(line_messaging.create_link_code, user.id)
    return LineLinkCodeResponse(**result)


@router.delete("/notifications/line", response_model=OperationResponse)
async def disconnect_line(user: AuthenticatedUser = Depends(require_user)):
    await run_in_threadpool(line_messaging.disconnect, user.id)
    return OperationResponse(ok=True, message="ยกเลิกการเชื่อม LINE แล้ว")


@router.post("/notifications/line/test", response_model=OperationResponse)
async def test_line_notification(
    user: AuthenticatedUser = Depends(require_notification_test_slot),
):
    delivered = await run_in_threadpool(line_messaging.send_test_to_user, user.id)
    if not delivered:
        raise HTTPException(422, detail="ยังไม่ได้เชื่อมบัญชี LINE")
    return OperationResponse(ok=True, message="ส่งข้อความทดสอบเข้า LINE แล้ว")


@router.post("/notifications/line/webhook", include_in_schema=False)
async def line_webhook(
    request: Request,
    x_line_signature: str = Header(default="", alias="x-line-signature"),
):
    chunks = bytearray()
    async for chunk in request.stream():
        if len(chunks) + len(chunk) > 1024 * 1024:
            raise HTTPException(413, detail="LINE webhook มีขนาดเกินกำหนด")
        chunks.extend(chunk)
    body = bytes(chunks)
    try:
        return await run_in_threadpool(
            line_delivery.accept_webhook
            if settings.line_durable_delivery_enabled
            else line_messaging.handle_webhook,
            body,
            x_line_signature,
        )
    except ValueError as exc:
        raise HTTPException(401, detail=str(exc)) from exc
