"""Bundled province labels: no upstream request and no additional dependency."""

import json
from functools import lru_cache
from pathlib import Path

from ..algorithms.province_labels import coordinate_label, province_label
from ..core.errors import ConfigurationError


@lru_cache(maxsize=1)
def _provinces() -> list[dict]:
    path = Path(__file__).resolve().parents[1] / "data" / "thailand-provinces.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise ConfigurationError("ข้อมูลชื่อพื้นที่สำรองยังไม่พร้อมใช้งาน") from exc


def resolve(lat: float, lon: float) -> dict:
    return province_label(_provinces(), lat, lon) or coordinate_label(lat, lon)
