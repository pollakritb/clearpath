"""OCR adapter that extracts only the numeric PM2.5 value from a report image."""

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
    },
    "required": ["pm25"],
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


def _image_input(image: bytes, content_type: str) -> dict:
    data_url = f"data:{content_type};base64,{base64.b64encode(image).decode('ascii')}"
    return {"type": "input_image", "image_url": data_url, "detail": "high"}


async def read_pm25(
    image: bytes,
    content_type: str,
    additional_images: list[tuple[bytes, str]] | None = None,
) -> dict:
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

    frames = [(image, content_type), *(additional_images or [])][:3]
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
                            "ภาพทั้งหมดเป็นเฟรมต่อเนื่องของเครื่องวัดเครื่องเดียวกัน "
                            "ให้เปรียบเทียบทุกเฟรมและอ่านเฉพาะตัวเลขค่า PM2.5 "
                            "มองหาป้าย PM2.5, PM 2.5 หรือหน่วย µg/m³ ที่สัมพันธ์กับตัวเลข "
                            "รักษาจุดทศนิยมตามหน้าจอ ห้ามใช้ค่า AQI, PM10, อุณหภูมิ, "
                            "ความชื้น, เวลา หรือแบตเตอรี่ และห้ามเดาตัวเลขที่มองไม่ชัด "
                            "เลือกค่าจากเฟรมที่คมชัดที่สุด หากไม่มีค่า PM2.5 ที่ยืนยันได้ "
                            "ให้คืน pm25 เป็น null โดยไม่ต้องอธิบาย"
                        ),
                    },
                    *[_image_input(content, mime) for content, mime in frames],
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
    reading_found = value is not None
    return {
        "available": True,
        "service_error": False,
        "pm25": value,
        # Keep the storage/API shape stable while the publication policy uses
        # only whether a numeric value was extracted.
        "confidence": 1.0 if reading_found else 0.0,
        "device_detected": reading_found,
        "display_clear": reading_found,
        "raw_text": "" if value is None else str(value),
    }
