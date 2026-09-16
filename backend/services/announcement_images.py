"""Validate and re-encode public announcement images without metadata."""

from __future__ import annotations

import io

from PIL import Image, UnidentifiedImageError

MAX_IMAGE_PIXELS = 20_000_000


def sanitize_public_image(content: bytes, content_type: str) -> bytes:
    """Decode a real image and re-encode pixels only, stripping EXIF/GPS metadata."""
    expected_format = {
        "image/jpeg": "JPEG",
        "image/png": "PNG",
        "image/webp": "WEBP",
    }.get(content_type)
    if not expected_format:
        raise ValueError("unsupported_image_type")
    try:
        with Image.open(io.BytesIO(content)) as source:
            source.load()
            if source.width * source.height > MAX_IMAGE_PIXELS:
                raise ValueError("image_dimensions_too_large")
            if source.format != expected_format:
                raise ValueError("image_content_type_mismatch")
            pixels = source.convert("RGBA" if "A" in source.getbands() else "RGB")
            output = io.BytesIO()
            if expected_format == "JPEG":
                pixels.convert("RGB").save(
                    output, format="JPEG", quality=88, optimize=True
                )
            elif expected_format == "PNG":
                pixels.save(output, format="PNG", optimize=True)
            else:
                pixels.save(output, format="WEBP", quality=88, method=4)
            return output.getvalue()
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError("invalid_image_content") from exc
