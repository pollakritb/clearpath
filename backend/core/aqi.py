"""เกณฑ์สี PM2.5 ของกรมควบคุมมลพิษ พ.ศ. 2566 — source of truth ฝั่ง server.

ค่าจากสถานีรัฐเป็นค่าเฉลี่ย 24 ชั่วโมง ส่วนค่าจากเครื่องประชาชนเป็นค่าขณะวัด
และต้องมีป้ายกำกับต่างกันใน UI แม้จะใช้ช่วงสีเดียวกันเพื่อช่วยสื่อสารความเสี่ยง.
"""

from typing import TypedDict


class AqiClass(TypedDict):
    level: str | None
    color: str | None
    advice: str | None


# (upper_bound_inclusive, level, hex_color, advice)
PM25_BANDS = [
    (15.0, "ดีมาก", "#3b82f6", "อากาศดีมาก เหมาะกับกิจกรรมกลางแจ้ง"),
    (25.0, "ดี", "#22c55e", "อากาศดี ทำกิจกรรมได้ตามปกติ"),
    (37.5, "ปานกลาง", "#eab308", "กลุ่มเสี่ยงควรสังเกตอาการ"),
    (75.0, "เริ่มมีผลกระทบต่อสุขภาพ", "#f97316", "กลุ่มเสี่ยงควรลดกิจกรรมนอกบ้าน"),
    (float("inf"), "มีผลกระทบต่อสุขภาพ", "#ef4444", "ทุกคนควรลดกิจกรรมนอกบ้านและสวมหน้ากาก"),
]

UNKNOWN: AqiClass = {"level": None, "color": "#95a5a6", "advice": "ไม่มีข้อมูล"}


def classify_pm25(pm25: float | None) -> AqiClass:
    """แปลงค่า PM2.5 → ระดับ/สี/คำแนะนำ"""
    if pm25 is None:
        return dict(UNKNOWN)  # type: ignore[return-value]
    for upper, level, color, advice in PM25_BANDS:
        if pm25 <= upper:
            return {"level": level, "color": color, "advice": advice}
    return dict(UNKNOWN)  # type: ignore[return-value]
