"""Supabase persistence boundary for independent CAMS grid generations."""

from ..core.errors import ConfigurationError, UpstreamError
from .supabase_client import get_client


def rpc(name: str, params: dict) -> dict:
    try:
        return get_client().rpc(name, params).execute().data
    except ConfigurationError:
        raise
    except Exception as exc:
        raise UpstreamError("ระบบจัดเก็บกริดพยากรณ์ยังไม่พร้อม") from exc


def read(table: str, configure) -> list[dict]:
    try:
        return configure(get_client().table(table)).execute().data or []
    except ConfigurationError:
        raise
    except Exception as exc:
        raise UpstreamError("โหลดกริดพยากรณ์จากฐานข้อมูลไม่สำเร็จ") from exc


def active() -> dict | None:
    rows = read(
        "cams_grid_active", lambda q: q.select("generation_id").eq("id", 1).limit(1)
    )
    return generation(rows[0]["generation_id"]) if rows else None


def generation(generation_id: str) -> dict | None:
    rows = read(
        "cams_grid_generations",
        lambda q: q.select("*").eq("id", generation_id).eq("status", "ready").limit(1),
    )
    return rows[0] if rows else None


def grid(grid_id: str) -> dict:
    rows = read(
        "cams_grid_definitions", lambda q: q.select("*").eq("id", grid_id).limit(1)
    )
    if not rows:
        raise UpstreamError("ไม่พบโครงสร้างกริดพยากรณ์")
    return rows[0]


def frames(generation_id: str, start: str, end: str) -> list[dict]:
    return read(
        "cams_grid_frames",
        lambda q: (
            q.select("valid_at,values")
            .eq("generation_id", generation_id)
            .gte("valid_at", start)
            .lte("valid_at", end)
            .order("valid_at")
            .limit(6)
        ),
    )


def chunks(job_id: str) -> list[dict]:
    rows = read(
        "cams_grid_chunks",
        lambda q: (
            q.select("payload").eq("job_id", job_id).order("batch_index").limit(100)
        ),
    )
    return [r["payload"] for r in rows]
