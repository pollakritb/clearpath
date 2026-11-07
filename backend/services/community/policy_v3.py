"""Independent XP release; never changes publication, Trust or IDW policy."""

from datetime import UTC, datetime
from time import monotonic

from ...algorithms.community_xp import stamp
from ...core.config import settings
from ...core.errors import UpstreamError
from .. import supabase_client as db

_CACHE = None


def release() -> dict:
    global _CACHE
    if not settings.contribution_v3_enabled:
        return {"enabled": False, "starts_at": None, "missions_enabled": False}
    if settings.local_demo_mode:
        return {
            "enabled": True,
            "starts_at": settings.contribution_v3_demo_start,
            "missions_enabled": False,
            "paused": False,
        }
    if _CACHE and monotonic() - _CACHE[0] < 2:
        return dict(_CACHE[1])
    try:
        row = db.get_client().rpc("contribution_v3_release", {}).execute().data
        _CACHE = (monotonic(), row)
        return dict(row)
    except Exception as exc:
        raise UpstreamError("โหลดกติกา XP รุ่นใหม่ไม่สำเร็จ") from exc


def applies(report: dict | None = None, *, policy: dict | None = None) -> bool:
    ctl = policy if policy is not None else release()
    return bool(
        ctl.get("starts_at")
        and (stamp(report["created_at"]) if report else datetime.now(UTC))
        >= stamp(ctl["starts_at"])
    )
