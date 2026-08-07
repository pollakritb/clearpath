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

import logging
import re
from time import perf_counter
from uuid import uuid4

import httpx
from fastapi import APIRouter, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .core.config import settings
from .core.errors import ConfigurationError, UpstreamError
from .core.observability import configure_logging
from .models.schemas import ReadinessResponse
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
from .services import readiness

REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


def create_app() -> FastAPI:
    configure_logging()
    request_logger = logging.getLogger("clearpath.request")
    error_logger = logging.getLogger("clearpath.error")
    app = FastAPI(title="ClearPath API", version="1.0.0")

    # same-origin ใน prod (ไม่ต้องใช้ CORS) — เปิดไว้เผื่อเรียกตรงตอน dev/ทดสอบ
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_cors_origins,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    )

    @app.middleware("http")
    async def request_observability(request: Request, call_next):
        supplied = request.headers.get("x-request-id", "")
        request_id = (
            supplied if REQUEST_ID_PATTERN.fullmatch(supplied) else str(uuid4())
        )
        started = perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            error_logger.exception(
                "unhandled_request_error",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                },
            )
            raise
        duration_ms = round((perf_counter() - started) * 1000, 1)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), browsing-topics=()"
        )
        request_logger.info(
            "request_completed",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status": response.status_code,
                "duration_ms": duration_ms,
            },
        )
        return response

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

    @api.get(
        "/ready",
        tags=["meta"],
        response_model=ReadinessResponse,
        responses={503: {"model": ReadinessResponse}},
    )
    def ready(response: Response):
        result = readiness.check_readiness()
        if result["status"] != "ready":
            response.status_code = 503
        return result

    app.include_router(api)

    # ── error handling: ไม่ปล่อย traceback ดิบ ส่ง status ที่สื่อความหมาย ──
    @app.exception_handler(ConfigurationError)
    async def _config_error(_request: Request, exc: ConfigurationError):
        error_logger.warning("configuration_error", extra={"path": _request.url.path})
        return JSONResponse(status_code=503, content={"detail": str(exc)})

    @app.exception_handler(UpstreamError)
    async def _upstream_error(_request: Request, exc: UpstreamError):
        error_logger.warning("upstream_error", extra={"path": _request.url.path})
        return JSONResponse(status_code=502, content={"detail": str(exc)})

    @app.exception_handler(httpx.HTTPError)
    async def _httpx_error(_request: Request, _exc: httpx.HTTPError):
        error_logger.warning("http_client_error", extra={"path": _request.url.path})
        return JSONResponse(
            status_code=502, content={"detail": "บริการภายนอกขัดข้องชั่วคราว"}
        )

    return app


app = create_app()
