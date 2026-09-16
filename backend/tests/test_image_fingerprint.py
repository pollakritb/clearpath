from io import BytesIO

import pytest
from PIL import Image

from backend.services.image_fingerprint import (
    detect_image_mime,
    fingerprint_image,
    hash_distance,
)


def _png(color: tuple[int, int, int]) -> bytes:
    output = BytesIO()
    Image.new("RGB", (32, 24), color).save(output, format="PNG")
    return output.getvalue()


def test_image_fingerprint_is_repeatable_and_exact_hash_changes():
    first = fingerprint_image(_png((20, 40, 60)))
    again = fingerprint_image(_png((20, 40, 60)))
    other = fingerprint_image(_png((60, 40, 20)))
    assert first["sha256"] == again["sha256"]
    assert first["sha256"] != other["sha256"]
    assert hash_distance(first["ahash"], again["ahash"]) == 0


def test_invalid_image_is_rejected():
    with pytest.raises(ValueError, match="ไม่ใช่ภาพ"):
        fingerprint_image(b"not-an-image")


def test_image_type_is_detected_from_decoded_content():
    content = _png((20, 40, 60))
    assert detect_image_mime(content) == "image/png"
    assert fingerprint_image(content)["mime"] == "image/png"


def test_exif_metadata_is_flagged_as_non_canvas_evidence():
    output = BytesIO()
    exif = Image.Exif()
    exif[36867] = "2026:09:16 12:00:00"
    Image.new("RGB", (32, 24), (20, 40, 60)).save(output, format="JPEG", exif=exif)

    assert fingerprint_image(output.getvalue())["has_exif"] is True
