"""Typed errors → แปลงเป็น HTTP status ที่สื่อความหมาย (ดู main.py)"""


class ConfigurationError(RuntimeError):
    """env/API key ที่จำเป็นยังไม่ได้ตั้งค่า → HTTP 503"""


class UpstreamError(RuntimeError):
    """บริการภายนอก (ORS/OWM/FIRMS/air4thai) ตอบผิดพลาด → HTTP 502"""
