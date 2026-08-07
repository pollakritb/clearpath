"""Private, data-minimized reports about incorrect public information."""

from __future__ import annotations

import re
from datetime import UTC, datetime
from uuid import uuid4

from .. import supabase_client

_EMAIL = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
_URL = re.compile(r"(?i)\b(?:https?://|www\.)\S+")
_COORDINATE_PAIR = re.compile(
    r"(?<!\d)[+-]?(?:\d{1,2}(?:\.\d{4,})|1[0-7]\d(?:\.\d{4,})?)"
    r"\s*[,/]\s*"
    r"[+-]?(?:\d{1,2}(?:\.\d{4,})|1[0-7]\d(?:\.\d{4,})?)(?!\d)"
)


def validate_feedback_text(value: str) -> str:
    """Reject contact data, links and likely precise coordinate pairs."""

    message = " ".join(value.split())
    if _EMAIL.search(message):
        raise ValueError("กรุณาอย่าใส่อีเมลหรือข้อมูลติดต่อส่วนตัว")
    if _URL.search(message):
        raise ValueError("กรุณาอย่าใส่ลิงก์ ให้ระบุชื่อสถานีหรือพื้นที่สาธารณะแทน")
    if _COORDINATE_PAIR.search(message):
        raise ValueError("กรุณาอย่าใส่พิกัดละเอียด ให้ระบุอำเภอหรือตำบลแทน")
    return message


def create_data_issue(user_id: str, values: dict) -> dict:
    message = validate_feedback_text(str(values["message"]))
    now = datetime.now(UTC).isoformat()
    return supabase_client.create_data_issue(
        {
            "id": str(uuid4()),
            "user_id": user_id,
            "category": str(values["category"]),
            "reference_id": values.get("reference_id") or None,
            "message": message,
            "status": "new",
            "created_at": now,
            "updated_at": now,
        }
    )
