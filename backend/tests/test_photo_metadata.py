from datetime import UTC, datetime
from io import BytesIO

import pytest
from PIL import Image

from backend.services.photo_metadata import (
    clean_photo,
    gallery_measurement_time,
    read_photo_metadata,
)


def jpeg_with_exif():
    image = Image.new("RGB", (30, 20), "blue")
    exif = Image.Exif()
    exif[36867] = "2020:01:02 10:30:00"
    exif[36881] = "+07:00"
    exif[271] = "Test camera"
    exif[274] = 6
    output = BytesIO()
    image.save(output, format="JPEG", exif=exif)
    return output.getvalue()


def test_reads_original_metadata_and_strips_public_image():
    original = jpeg_with_exif()
    metadata = read_photo_metadata(original)
    assert metadata["exif_captured_at"] == "2020-01-02T10:30:00+07:00"
    assert metadata["camera_make"] == "Test camera"
    assert metadata["size_bytes"] == len(original)
    assert metadata["width"] == 30
    with Image.open(BytesIO(clean_photo(original))) as clean:
        assert not clean.getexif()
        assert clean.size == (20, 30)


def test_metadata_missing_is_unknown_not_upload_time():
    output = BytesIO()
    Image.new("RGB", (10, 10)).save(output, format="PNG")
    metadata = read_photo_metadata(output.getvalue())
    assert metadata["exif_captured_at"] is None
    assert metadata["exif_local_time"] is None
    assert metadata["exif_gps"] is None


def test_old_exif_cannot_be_relabelled_as_fresh():
    now = datetime(2026, 10, 28, tzinfo=UTC)
    effective, source = gallery_measurement_time(
        read_photo_metadata(jpeg_with_exif()), now.isoformat(), -420, now
    )
    assert effective == datetime(2020, 1, 2, 3, 30, tzinfo=UTC)
    assert source == "exif"


def test_missing_timezone_is_explicitly_attributed_to_user():
    now = datetime(2026, 10, 28, tzinfo=UTC)
    effective, source = gallery_measurement_time(
        {"exif_local_time": "2020-01-02T10:30:00"}, now.isoformat(), -420, now
    )
    assert effective == datetime(2020, 1, 2, 3, 30, tzinfo=UTC)
    assert source == "exif_user_timezone"


@pytest.mark.parametrize(
    "claimed", [None, "invalid", "2026-10-28T00:00:00", "2030-01-01T00:00:00Z"]
)
def test_gallery_requires_explicit_valid_measurement_time(claimed):
    with pytest.raises(ValueError):
        gallery_measurement_time({}, claimed, -420, datetime(2026, 10, 28, tzinfo=UTC))


def test_extracts_gps_from_original_and_removes_it_from_preview():
    from PIL.TiffImagePlugin import IFDRational

    image = Image.new("RGB", (20, 20), "green")
    exif = Image.Exif()
    exif[34853] = {
        1: "N",
        2: (IFDRational(13), IFDRational(48), IFDRational(0)),
        3: "E",
        4: (IFDRational(100), IFDRational(6), IFDRational(0)),
    }
    output = BytesIO()
    image.save(output, format="JPEG", exif=exif)
    content = output.getvalue()
    assert read_photo_metadata(content)["exif_gps"] == {"lat": 13.8, "lon": 100.1}
    assert read_photo_metadata(clean_photo(content))["exif_gps"] is None


def test_heic_keeps_metadata_and_returns_exif_free_jpeg_preview():
    import base64

    from backend.services.image_fingerprint import fingerprint_image
    from backend.services.photo_metadata import inspect_photo

    image = Image.new("RGB", (32, 24), "red")
    exif = Image.Exif()
    exif[36867] = "2020:01:02 10:30:00"
    exif[36881] = "+07:00"
    output = BytesIO()
    image.save(output, format="HEIF", exif=exif)
    original = output.getvalue()
    metadata = inspect_photo(original)
    assert metadata["mime"] == "image/heic"
    assert metadata["exif_captured_at"] == "2020-01-02T10:30:00+07:00"
    assert fingerprint_image(original)["mime"] == "image/heic"
    preview = base64.b64decode(metadata["preview_data_url"].split(",")[1])
    with Image.open(BytesIO(preview)) as decoded:
        assert decoded.format == "JPEG"
        assert not decoded.getexif()
    assert read_photo_metadata(clean_photo(original))["mime"] == "image/jpeg"


def test_iphone_multi_picture_jpeg_uses_primary_frame_and_keeps_original_metadata():
    import base64

    from backend.services.image_fingerprint import detect_image_mime, fingerprint_image
    from backend.services.photo_metadata import inspect_photo

    primary = Image.new("RGB", (32, 24), "red")
    exif = Image.Exif()
    exif[36867] = "2020:01:02 10:30:00"
    exif[36881] = "+07:00"
    exif[274] = 6
    output = BytesIO()
    primary.save(
        output,
        format="MPO",
        save_all=True,
        append_images=[Image.new("RGB", (16, 12), "blue")],
        exif=exif,
    )
    original = output.getvalue()
    with Image.open(BytesIO(original)) as image:
        assert image.format == "MPO"
        assert image.n_frames == 2
    assert detect_image_mime(original) == "image/jpeg"
    assert fingerprint_image(original)["mime"] == "image/jpeg"
    metadata = inspect_photo(original)
    assert metadata["exif_captured_at"] == "2020-01-02T10:30:00+07:00"
    preview = base64.b64decode(metadata["preview_data_url"].split(",")[1])
    for content in [preview, clean_photo(original)]:
        with Image.open(BytesIO(content)) as image:
            assert image.format == "JPEG"
            assert image.size == (24, 32)
            assert not image.getexif()
            red, _green, blue = image.getpixel((12, 16))
            assert red > 200 and blue < 50
