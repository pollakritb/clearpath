"""Shared image-evidence rules for the community draft workflow."""

from starlette.concurrency import run_in_threadpool
from starlette.datastructures import UploadFile

from .. import image_fingerprint, supabase_client

IMAGE_EXTENSIONS = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
}
PERCEPTUAL_DUPLICATE_DISTANCE = 4
MAX_IMAGE_BYTES = 4_000_000
MAX_MULTIPART_BYTES = 4_200_000  # room for multipart headers, below Vercel 4.5 MB
MIME_ALIASES = {
    "image/heif": "image/heic",
    "image/heic-sequence": "image/heic",
    "image/heif-sequence": "image/heic",
}


class InvalidImageUpload(ValueError):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code


async def read_upload(
    upload: UploadFile, *, supplementary: bool = False
) -> tuple[bytes, str]:
    """Read bounded image bytes and verify the declared type against decoded content."""
    declared = upload.content_type or ""
    allowed = IMAGE_EXTENSIONS.keys() | MIME_ALIASES.keys()
    unknown = declared in {"", "application/octet-stream"}
    if declared not in allowed and (supplementary or not unknown):
        raise InvalidImageUpload(
            415,
            "ภาพเสริมต้องเป็น JPEG, PNG หรือ WEBP"
            if supplementary
            else "รองรับภาพ JPEG, PNG, WEBP และ HEIC/HEIF จาก iPhone",
        )
    content = await upload.read(MAX_IMAGE_BYTES + 1)
    if not content and not supplementary:
        raise InvalidImageUpload(400, "ไฟล์ภาพว่าง")
    if not content or len(content) > MAX_IMAGE_BYTES:
        raise InvalidImageUpload(
            413,
            "ภาพเสริมแต่ละภาพต้องไม่เกิน 4 MB" if supplementary else "ภาพต้องมีขนาดไม่เกิน 4 MB",
        )
    try:
        detected = await run_in_threadpool(image_fingerprint.detect_image_mime, content)
    except ValueError as exc:
        raise InvalidImageUpload(415, str(exc)) from exc
    expected = declared if supplementary else MIME_ALIASES.get(declared, declared)
    if not unknown and detected != expected:
        raise InvalidImageUpload(
            415,
            "ชนิดไฟล์ภาพเสริมไม่ตรงกับข้อมูลภายในไฟล์"
            if supplementary
            else "ชนิดไฟล์ภาพไม่ตรงกับข้อมูลภายในไฟล์",
        )
    return content, detected


def find_duplicate(fingerprint: dict) -> tuple[dict | None, bool, int | None]:
    exact = supabase_client.get_report_by_image_sha256(fingerprint["sha256"])
    if exact:
        return exact, True, 0
    similar: tuple[dict, int] | None = None
    for row in supabase_client.get_recent_image_fingerprints(500):
        if row.get("image_sha256") == fingerprint["sha256"]:
            return row, True, 0
        distance = image_fingerprint.hash_distance(
            row.get("image_ahash"), fingerprint["ahash"]
        )
        if (
            distance is not None
            and distance <= PERCEPTUAL_DUPLICATE_DISTANCE
            and (similar is None or distance < similar[1])
        ):
            similar = (row, distance)
    return (similar[0], False, similar[1]) if similar else (None, False, None)
