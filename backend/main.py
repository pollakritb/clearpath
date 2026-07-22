"""ClearPath FastAPI application — รวม routers ทั้งหมดไว้ใต้ prefix /api

routing บน Vercel: /api/* → api/index.py → app นี้ (ดู vercel.json)
local dev: uvicorn backend.main:app --port 8000 (Next proxy /api/* มาที่นี่)
"""

# ให้ Python ใช้ trust store ของ OS (เหมือน curl/เบราว์เซอร์) แทน bundle ของ certifi
# บาง endpoint ราชการไทย (เช่น air4thai) ใช้ CA/intermediate ที่ certifi ไม่มี → verify fail
# ต้อง inject ก่อนสร้าง SSL context ใดๆ (จึงอยู่บนสุด); ถ้า prod ไม่มี truststore ก็ข้ามไป
try:
    import truststore

    truststore.inject_into_ssl()
except Exception:  # pragma: no cover - degrade อย่างสุภาพถ้าไม่มี package
    pass

import httpx
from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .core.errors import ConfigurationError, UpstreamError
from .routers import (
    admin,
    community,
    cron,
    firms,
    forecast,
    history,
    locations,
    notifications,
    pm25,
    validate,
    weather,
)


def create_app() -> FastAPI:
    app = FastAPI(title="ClearPath API", version="1.0.0")

    # same-origin ใน prod (ไม่ต้องใช้ CORS) — เปิดไว้เผื่อเรียกตรงตอน dev/ทดสอบ
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    api = APIRouter(prefix="/api")
    api.include_router(pm25.router, tags=["pm25"])
    api.include_router(weather.router, tags=["weather"])
    api.include_router(firms.router, tags=["firms"])
    api.include_router(history.router, tags=["history"])
    api.include_router(locations.router, tags=["locations"])
    api.include_router(forecast.router, tags=["forecast"])
    api.include_router(community.router, tags=["community"])
    api.include_router(notifications.router, tags=["notifications"])
    api.include_router(admin.router, tags=["admin"])
    api.include_router(validate.router, tags=["validate"])
    api.include_router(cron.router, tags=["cron"])

    @api.get("/health", tags=["meta"])
    def health():
        return {"ok": True, "service": "clearpath-api"}

    app.include_router(api)

    # ── error handling: ไม่ปล่อย traceback ดิบ ส่ง status ที่สื่อความหมาย ──
    @app.exception_handler(ConfigurationError)
    async def _config_error(_request: Request, exc: ConfigurationError):
        return JSONResponse(status_code=503, content={"detail": str(exc)})

    @app.exception_handler(UpstreamError)
    async def _upstream_error(_request: Request, exc: UpstreamError):
        return JSONResponse(status_code=502, content={"detail": str(exc)})

    @app.exception_handler(httpx.HTTPError)
    async def _httpx_error(_request: Request, _exc: httpx.HTTPError):
        return JSONResponse(
            status_code=502, content={"detail": "บริการภายนอกขัดข้องชั่วคราว"}
        )

    return app


app = create_app()
