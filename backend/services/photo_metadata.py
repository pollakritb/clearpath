"""Read a bounded allowlist from original photos and produce EXIF-free previews."""

from __future__ import annotations

import base64
import io
from datetime import UTC, datetime, timedelta, timezone
from math import isfinite

from PIL import Image, ImageOps

from ..algorithms.trust import is_thailand_area
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
        # A local EXIF clock has no timezone. Only resolve it from Thai GPS,
        # never from the uploader's browser, current GPS or file modification time.
        if (
            local_time
            and not captured_at
            and coords
            and is_thailand_area(coords["lat"], coords["lon"])
        ):
            captured_at = (
                datetime.fromisoformat(local_time)
                .replace(tzinfo=timezone(timedelta(hours=7)))
                .isoformat()
            )
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
    """Use one oriented JPEG preview across browsers; keep original evidence intact."""
    metadata = read_photo_metadata(content)
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
    received_at: datetime,
) -> tuple[datetime, str]:
    """Use original EXIF only; missing evidence cannot be replaced by user input."""
    captured_at = metadata.get("exif_captured_at")
    if not captured_at:
        raise ValueError("ภาพนี้ไม่มีข้อมูลเวลาถ่าย กรุณาเลือกภาพต้นฉบับหรือถ่ายใหม่ผ่าน ClearPath")
    try:
        captured = datetime.fromisoformat(captured_at.replace("Z", "+00:00"))
        if captured.tzinfo is None:
            raise ValueError("timezone_required")
        captured = captured.astimezone(UTC)
    except (TypeError, ValueError) as exc:
        raise ValueError(
            "เวลาถ่ายในภาพไม่ถูกต้อง กรุณาเลือกภาพต้นฉบับหรือถ่ายใหม่ผ่าน ClearPath"
        ) from exc
    if captured > received_at + timedelta(minutes=5):
        raise ValueError("เวลาถ่ายในภาพอยู่ในอนาคต กรุณาเลือกภาพต้นฉบับหรือถ่ายใหม่ผ่าน ClearPath")
    return captured, "exif" if metadata.get(
        "exif_timezone"
    ) else "exif_thailand_timezone"
