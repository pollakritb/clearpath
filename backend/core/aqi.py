"""มาตรฐานสี/ระดับ PM2.5 (กรมควบคุมมลพิษ / WHO) — แหล่งความจริงฝั่ง server.

ใช้เกณฑ์ค่าเฉลี่ย 24 ชั่วโมง (µg/m³) ตาม blueprint:
    0–25   ดี                 เขียว
    26–37  ปานกลาง            เหลือง
    38–50  มีผลต่อกลุ่มเสี่ยง  ส้ม
    51–90  มีผลต่อสุขภาพ       แดง
    >90    อันตราย            ม่วง
"""
from typing import Optional, TypedDict


class AqiClass(TypedDict):
    level: Optional[str]
    color: Optional[str]
    advice: Optional[str]


# (upper_bound_inclusive, level, hex_color, advice)
PM25_BANDS = [
    (25.0, "ดี", "#2ecc71", "อากาศดี ออกได้ตามปกติ"),
    (37.0, "ปานกลาง", "#f1c40f", "กลุ่มเสี่ยงควรสังเกตอาการ"),
    (50.0, "มีผลต่อกลุ่มเสี่ยง", "#e67e22", "ผู้ป่วย/กลุ่มเสี่ยงควรลดกิจกรรมนอกบ้าน"),
    (90.0, "มีผลต่อสุขภาพ", "#e74c3c", "ทุกคนควรลดกิจกรรมนอกบ้าน สวมหน้ากาก"),
    (float("inf"), "อันตราย", "#8e44ad", "งดออกนอกบ้าน สวม N95"),
]

UNKNOWN: AqiClass = {"level": None, "color": "#95a5a6", "advice": "ไม่มีข้อมูล"}


def classify_pm25(pm25: Optional[float]) -> AqiClass:
    """แปลงค่า PM2.5 → ระดับ/สี/คำแนะนำ"""
    if pm25 is None:
        return dict(UNKNOWN)  # type: ignore[return-value]
    for upper, level, color, advice in PM25_BANDS:
        if pm25 <= upper:
            return {"level": level, "color": color, "advice": advice}
    return dict(UNKNOWN)  # type: ignore[return-value]
