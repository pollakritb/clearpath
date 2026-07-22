from io import BytesIO

import pytest
from PIL import Image

from backend.services.image_fingerprint import fingerprint_image, hash_distance


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
