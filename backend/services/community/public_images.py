"""Short-lived opaque image links: storage paths can contain private Auth IDs."""

import hashlib
import hmac
import time

from ...core.config import settings
from ...core.errors import UpstreamError
from .. import local_store
from .. import supabase_client as db


def token(report_id: str, expires: int) -> str:
    return hmac.new(
        settings.effective_capture_secret.encode(),
        f"public-image:{report_id}:{expires}".encode(),
        hashlib.sha256,
    ).hexdigest()


def url(report_id: str) -> str:
    expires = int(time.time()) + 300
    return f"/api/community/report-images/{report_id}?expires={expires}&signature={token(report_id, expires)}"


def read(report_id: str, expires: int, signature: str) -> bytes:
    now = int(time.time())
    if (
        expires < now
        or expires > now + 300
        or not hmac.compare_digest(signature, token(report_id, expires))
    ):
        raise KeyError("expired image")
    row = db.get_community_report(report_id)
    if not row or row.get("status") != "approved" or not row.get("image_path"):
        raise KeyError("image unavailable")
    path = row["image_path"]
    if settings.local_demo_mode:
        result = local_store.get_image(path, local_store.image_token(path))
        if not result:
            raise KeyError("image unavailable")
        return result[0]
    try:
        return (
            db.get_client().storage.from_(settings.report_image_bucket).download(path)
        )
    except Exception as exc:
        raise UpstreamError("โหลดภาพรายงานไม่สำเร็จ") from exc
