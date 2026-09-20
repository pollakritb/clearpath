"""Pure OCR-number publication rule for community reports."""

from __future__ import annotations


def evaluate_automatic_review(
    *,
    ocr_pm25: float | None,
) -> dict:
    """Publish the OCR value whenever the image yields a numeric PM2.5 reading."""
    if ocr_pm25 is None:
        return {
            "approved": False,
            "verified_pm25": None,
            "reasons": ["ระบบอ่านตัวเลข PM2.5 จากภาพไม่ได้ กรุณาถ่ายภาพใหม่"],
        }
    value = max(0.0, min(1000.0, float(ocr_pm25)))
    return {
        "approved": True,
        "verified_pm25": round(value, 1),
        "reasons": ["OCR อ่านตัวเลข PM2.5 จากภาพและเผยแพร่อัตโนมัติ"],
    }
