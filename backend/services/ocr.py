"""OCR/vision adapter สำหรับอ่านข้อความจากหน้าจอเครื่องวัด PM2.5.

ใช้ OpenAI Responses API แบบ image input + Structured Outputs เมื่อมี key.
ภาพทุกภาพยังต้องผ่าน Trust Score และผู้ดูแลอนุมัติก่อนเผยแพร่.
"""

from __future__ import annotations

import base64
import json

import httpx

from ..core.config import settings
from ..core.errors import UpstreamError

RESPONSES_URL = "https://api.openai.com/v1/responses"

OCR_SCHEMA = {
    "type": "object",
    "properties": {
        "pm25": {"type": ["number", "null"]},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "device_detected": {"type": "boolean"},
        "display_clear": {"type": "boolean"},
        "raw_text": {"type": "string"},
    },
    "required": ["pm25", "confidence", "device_detected", "display_clear", "raw_text"],
    "additionalProperties": False,
}


def _output_text(payload: dict) -> str:
    for output in payload.get("output") or []:
        if output.get("type") != "message":
            continue
        for item in output.get("content") or []:
            if item.get("type") == "refusal":
                raise UpstreamError("ระบบ OCR ปฏิเสธการประมวลผลภาพนี้")
            if item.get("type") == "output_text" and item.get("text"):
                return str(item["text"])
    raise UpstreamError("ระบบ OCR ไม่คืนผลลัพธ์ที่อ่านได้")


async def read_pm25(image: bytes, content_type: str) -> dict:
    """คืนผล OCR; available=False เมื่อยังไม่ได้ตั้ง API key."""
    if not settings.openai_api_key:
        return {
            "available": False,
            "pm25": None,
            "confidence": 0.0,
            "device_detected": False,
            "display_clear": False,
            "raw_text": "",
        }

    data_url = f"data:{content_type};base64,{base64.b64encode(image).decode('ascii')}"
    body = {
        "model": settings.openai_ocr_model,
        "store": False,
        "input": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "อ่านข้อความบนหน้าจอเครื่องวัด PM2.5 จากภาพนี้เท่านั้น "
                            "คืนค่า PM2.5 ที่แสดง ไม่ใช่ AQI หรืออุณหภูมิ "
                            "ถ้าไม่พบเครื่องวัดหรืออ่านเลขไม่ได้ให้ pm25 เป็น null และ confidence ต่ำ"
                        ),
                    },
                    {"type": "input_image", "image_url": data_url, "detail": "high"},
                ],
            }
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "pm25_meter_reading",
                "strict": True,
                "schema": OCR_SCHEMA,
            }
        },
        "max_output_tokens": 300,
    }
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(
                RESPONSES_URL,
                json=body,
                headers={
                    "Authorization": f"Bearer {settings.openai_api_key}",
                    "Content-Type": "application/json",
                },
            )
            response.raise_for_status()
            result = json.loads(_output_text(response.json()))
    except (httpx.HTTPError, json.JSONDecodeError, KeyError, TypeError) as exc:
        raise UpstreamError("OCR ประมวลผลไม่สำเร็จ") from exc

    value = result.get("pm25")
    if value is not None:
        value = max(0.0, min(1000.0, float(value)))
    return {
        "available": True,
        "pm25": value,
        "confidence": max(0.0, min(1.0, float(result.get("confidence", 0.0)))),
        "device_detected": bool(result.get("device_detected")),
        "display_clear": bool(result.get("display_clear")),
        "raw_text": str(result.get("raw_text") or "")[:500],
    }
