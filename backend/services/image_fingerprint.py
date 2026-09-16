"""Validate report images and compute exact/perceptual fingerprints."""

from __future__ import annotations

import hashlib
import io

from PIL import Image, UnidentifiedImageError

Image.MAX_IMAGE_PIXELS = 25_000_000

_IMAGE_FORMAT_MIME = {
    "JPEG": "image/jpeg",
    "PNG": "image/png",
    "WEBP": "image/webp",
}


def detect_image_mime(content: bytes) -> str:
    """Return the decoded image MIME type; never trust the upload header alone."""
    try:
        with Image.open(io.BytesIO(content)) as image:
            image.verify()
            mime = _IMAGE_FORMAT_MIME.get(str(image.format).upper())
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError,
    ) as exc:
        raise ValueError("ไฟล์ไม่ใช่ภาพที่อ่านได้หรือภาพมีขนาดผิดปกติ") from exc
    if not mime:
        raise ValueError("รองรับเฉพาะภาพ JPEG, PNG หรือ WEBP")
    return mime


def fingerprint_image(content: bytes) -> dict:
    exact = hashlib.sha256(content).hexdigest()
    detected_mime = detect_image_mime(content)
    try:
        with Image.open(io.BytesIO(content)) as image:
            has_exif = bool(image.getexif())
            gray = image.convert("L").resize((8, 8))
            pixels = list(gray.get_flattened_data())
            width, height = image.size
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError,
    ) as exc:
        raise ValueError("ไฟล์ไม่ใช่ภาพที่อ่านได้หรือภาพมีขนาดผิดปกติ") from exc
    average = sum(pixels) / len(pixels)
    bits = "".join("1" if pixel >= average else "0" for pixel in pixels)
    return {
        "sha256": exact,
        "ahash": f"{int(bits, 2):016x}",
        "width": width,
        "height": height,
        "mime": detected_mime,
        "has_exif": has_exif,
    }


def hash_distance(first: str | None, second: str | None) -> int | None:
    if not first or not second:
        return None
    try:
        return (int(first, 16) ^ int(second, 16)).bit_count()
    except ValueError:
        return None
