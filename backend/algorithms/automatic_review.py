"""Pure fail-closed decision rules for hybrid automatic evidence review."""

from __future__ import annotations


def _reading_tolerance(ocr_pm25: float, claimed_pm25: float) -> float:
    """Bound acceptable display-reading variance to 3..15 µg/m³."""
    return max(3.0, min(15.0, max(abs(ocr_pm25), abs(claimed_pm25)) * 0.10))


def evaluate_automatic_review(
    *,
    enabled: bool,
    ocr_pm25: float | None,
    ocr_confidence: float,
    device_detected: bool,
    display_clear: bool,
    claimed_pm25: float,
    duplicate_detected: bool,
    clock_warning: bool,
    gps_accuracy_m: float,
    burst_frame_count: int,
    minimum_confidence: float = 0.92,
    maximum_gps_accuracy_m: float = 100.0,
) -> dict:
    """Approve only evidence where every independently checkable signal passes.

    A failed signal does not reject the report. It routes the evidence to the
    human exception queue so the automatic path can never publish uncertain data.
    """
    blockers: list[str] = []
    if not enabled:
        blockers.append("ระบบตรวจอัตโนมัติถูกปิดไว้")
    if ocr_pm25 is None:
        blockers.append("ระบบอ่านค่า PM2.5 จากภาพไม่ได้")
    if ocr_confidence < minimum_confidence:
        blockers.append(f"ความมั่นใจ OCR ต่ำกว่า {round(minimum_confidence * 100)}%")
    if not device_detected:
        blockers.append("ไม่ยืนยันว่าเป็นหน้าจอเครื่องวัด PM2.5")
    if not display_clear:
        blockers.append("ตัวเลขบนหน้าจอไม่ชัดพอสำหรับอนุมัติอัตโนมัติ")
    if duplicate_detected:
        blockers.append("ภาพคล้ายหลักฐานที่เคยส่ง")
    if clock_warning:
        blockers.append("เวลาจากอุปกรณ์ไม่สอดคล้องกับ camera session")
    if gps_accuracy_m > maximum_gps_accuracy_m:
        blockers.append(
            f"GPS ต้องคลาดเคลื่อนไม่เกิน {maximum_gps_accuracy_m:.0f} เมตรสำหรับการอนุมัติอัตโนมัติ"
        )
    if burst_frame_count < 2:
        blockers.append("ต้องมีภาพต่อเนื่องเสริมอีก 2 เฟรม")

    if ocr_pm25 is not None:
        tolerance = _reading_tolerance(float(ocr_pm25), claimed_pm25)
        difference = abs(float(ocr_pm25) - claimed_pm25)
        if difference > tolerance:
            blockers.append(f"ค่าที่ผู้ใช้ยืนยันต่างจาก OCR {difference:.1f} µg/m³")

    if blockers:
        return {
            "approved": False,
            "verified_pm25": None,
            "reasons": blockers,
        }
    return {
        "approved": True,
        "verified_pm25": round(float(ocr_pm25), 1),
        "reasons": [
            "OCR มีความมั่นใจสูงและอ่านค่าตรงกับผู้ใช้",
            "ตรวจพบหน้าจอเครื่องวัดชัดเจนจาก camera session",
            "GPS เวลา ภาพต่อเนื่อง และการตรวจภาพซ้ำผ่านเกณฑ์",
        ],
    }
