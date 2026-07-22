"""Shared image-evidence rules for the community draft workflow."""

from .. import image_fingerprint, supabase_client

IMAGE_EXTENSIONS = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
PERCEPTUAL_DUPLICATE_DISTANCE = 4


def find_duplicate(fingerprint: dict) -> tuple[dict | None, bool, int | None]:
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
