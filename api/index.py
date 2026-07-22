"""Vercel Python function entry point.

Vercel routes /api/* มาที่ไฟล์นี้ (ดู vercel.json) แล้ว FastAPI จัดการ routing ต่อ
ตัว ASGI app ชื่อ `app` คือสิ่งที่ Vercel เสิร์ฟ
"""

import os
import sys

# ให้ import แพ็กเกจ `backend` (อยู่ที่ project root) ได้บน Vercel
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.main import app  # noqa: E402

__all__ = ["app"]
