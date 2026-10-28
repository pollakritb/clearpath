"""Read a bounded allowlist from original photos and produce EXIF-free previews."""

from __future__ import annotations

import base64
import io
from datetime import datetime
from math import isfinite

from PIL import Image, ImageOps

from .image_fingerprint import detect_image_mime


def read_photo_metadata(content: bytes) -> dict:
    mime = detect_image_mime(content)
    with Image.open(io.BytesIO(content)) as image:
        exif = image.getexif()
        detail = exif.get_ifd(34665) if exif.get(34665) else {}
        raw = str(detail.get(36867) or exif.get(36867) or "")
        offset = str(detail.get(36881) or exif.get(36881) or "")
        local_time = None
        captured_at = None
        try:
            parsed = datetime.strptime(raw, "%Y:%m:%d %H:%M:%S")
            local_time = parsed.isoformat()
            if offset:
                aware = datetime.fromisoformat(local_time + offset)
                if aware.tzinfo is not None:
                    captured_at = aware.isoformat()
        except ValueError:
            pass
        gps = exif.get_ifd(34853) if exif.get(34853) else {}
        coords = {}
        try:
            for tag, ref, key, bound in [(2, 1, "lat", 90), (4, 3, "lon", 180)]:
                parts = gps[tag]
                value = float(parts[0]) + float(parts[1]) / 60 + float(parts[2]) / 3600
                if gps.get(ref) in ("S", "W", b"S", b"W"):
                    value = -value
                if not isfinite(value) or abs(value) > bound:
                    raise ValueError("invalid_exif_coordinate")
                coords[key] = value
        except (KeyError, TypeError, ValueError, ZeroDivisionError, IndexError):
            coords = {}
        return {
            "mime": mime,
            "size_bytes": len(content),
            "width": image.width,
            "height": image.height,
            "orientation": int(exif.get(274) or 1),
            "exif_captured_at": captured_at,
            "exif_local_time": local_time,
            "exif_timezone": offset[:6] or None,
            "exif_gps": coords or None,
            "camera_make": str(exif.get(271) or "")[:100] or None,
            "camera_model": str(exif.get(272) or "")[:100] or None,
        }


def clean_photo(content: bytes) -> bytes:
    """Strip all metadata and orient pixels; never serve the original file publicly."""
    with Image.open(io.BytesIO(content)) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        image.thumbnail((1920, 1920))
        output = io.BytesIO()
        image.save(output, format="JPEG", quality=90)
        return output.getvalue()


def inspect_photo(content: bytes) -> dict:
    """Return original metadata plus a small JPEG preview for HEIF-incompatible browsers."""
    metadata = read_photo_metadata(content)
    if metadata["mime"] == "image/heic":
        with Image.open(io.BytesIO(content)) as image:
            image = ImageOps.exif_transpose(image).convert("RGB")
            image.thumbnail((640, 640))
            output = io.BytesIO()
            image.save(output, format="JPEG", quality=80)
            metadata["preview_data_url"] = "data:image/jpeg;base64," + base64.b64encode(
                output.getvalue()
            ).decode("ascii")
    return metadata


def gallery_measurement_time(
    metadata: dict,
    claimed_at: str | None,
    offset_minutes: int | None,
    received_at: datetime,
) -> tuple[datetime, str]:
    """Never relabel an EXIF-dated old photo as a fresh upload."""
    from datetime import UTC, timedelta, timezone

    try:
        claimed = datetime.fromisoformat((claimed_at or "").replace("Z", "+00:00"))
        if claimed.tzinfo is None:
            raise ValueError("timezone_required")
        claimed = claimed.astimezone(UTC)
    except ValueError as exc:
        raise ValueError("กรุณาระบุวันเวลาที่วัดพร้อมเขตเวลา") from exc
    if claimed > received_at + timedelta(minutes=5):
        raise ValueError("เวลาที่วัดต้องไม่อยู่ในอนาคต")
    if (
        metadata.get("exif_local_time")
        and not metadata.get("exif_captured_at")
        and offset_minutes is None
    ):
        raise ValueError("กรุณายืนยันเขตเวลาของเวลาถ่ายในภาพ")
    exif_time = None
    if metadata.get("exif_captured_at"):
        exif_time = datetime.fromisoformat(metadata["exif_captured_at"]).astimezone(UTC)
    elif metadata.get("exif_local_time") and offset_minutes is not None:
        exif_time = (
            datetime.fromisoformat(metadata["exif_local_time"])
            .replace(tzinfo=timezone(timedelta(minutes=-offset_minutes)))
            .astimezone(UTC)
        )
    if exif_time is not None and exif_time <= claimed:
        return exif_time, "exif" if metadata.get(
            "exif_captured_at"
        ) else "exif_user_timezone"
    return claimed, "user_confirmed"
