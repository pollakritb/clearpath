"""Validate report images and compute exact/perceptual fingerprints."""

from __future__ import annotations

import hashlib
import io

from PIL import Image, UnidentifiedImageError

Image.MAX_IMAGE_PIXELS = 25_000_000


def fingerprint_image(content: bytes) -> dict:
    exact = hashlib.sha256(content).hexdigest()
    try:
        with Image.open(io.BytesIO(content)) as image:
            image.verify()
        with Image.open(io.BytesIO(content)) as image:
            gray = image.convert("L").resize((8, 8))
            pixels = list(gray.getdata())
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
        "width": image.width,
        "height": image.height,
    }


def hash_distance(first: str | None, second: str | None) -> int | None:
    if not first or not second:
        return None
    try:
        return (int(first, 16) ^ int(second, 16)).bit_count()
    except ValueError:
        return None
