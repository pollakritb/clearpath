from __future__ import annotations

import io

import pytest
from PIL import Image

from backend.services.announcement_images import sanitize_public_image


def test_announcement_image_is_reencoded_without_exif_metadata():
    source = io.BytesIO()
    image = Image.new("RGB", (24, 24), (20, 120, 90))
    exif = Image.Exif()
    exif[0x010E] = "private location note"
    image.save(source, format="JPEG", exif=exif)

    sanitized = sanitize_public_image(source.getvalue(), "image/jpeg")
    with Image.open(io.BytesIO(sanitized)) as result:
        assert result.format == "JPEG"
        assert not result.getexif()
        assert result.size == (24, 24)


def test_announcement_image_rejects_declared_type_mismatch_and_invalid_bytes():
    png = io.BytesIO()
    Image.new("RGB", (8, 8)).save(png, format="PNG")
    with pytest.raises(ValueError, match="content_type_mismatch"):
        sanitize_public_image(png.getvalue(), "image/jpeg")
    with pytest.raises(ValueError, match="invalid_image_content"):
        sanitize_public_image(b"not-an-image", "image/png")
