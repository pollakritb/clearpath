"""Pure interpretation of OCR evidence quality for user-facing status."""

from typing import Literal

OcrStatus = Literal[
    "unavailable",
    "service_error",
    "no_device",
    "unclear_display",
    "no_reading",
    "low_confidence",
    "ready",
]


def classify_ocr_result(result: dict) -> OcrStatus:
    """Classify OCR evidence without making a moderation decision."""
    if not result.get("available"):
        return "service_error" if result.get("service_error") else "unavailable"
    if not result.get("device_detected"):
        return "no_device"
    if not result.get("display_clear"):
        return "unclear_display"
    if result.get("pm25") is None:
        return "no_reading"
    if float(result.get("confidence") or 0) < 0.85:
        return "low_confidence"
    return "ready"
