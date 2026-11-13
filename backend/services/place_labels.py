"""Coordinate label orchestration; bounded cache and a neutral fallback."""

import logging
from threading import Lock
from time import monotonic

from ..core.config import settings
from ..core.errors import UpstreamError
from . import geoapify_reverse, photon_reverse, province_labels

_cache: dict[tuple[float, float], tuple[float, dict]] = {}
_lock = Lock()
logger = logging.getLogger("clearpath.places")


async def resolve_label(lat: float, lon: float) -> dict:
    key = (round(lat, 5), round(lon, 5))
    with _lock:
        cached = _cache.get(key)
    if cached and monotonic() - cached[0] < 3600:
        return cached[1]
    providers = (
        [geoapify_reverse.resolve, photon_reverse.resolve]
        if settings.geoapify_api_key
        else [photon_reverse.resolve]
    )
    for provider in providers:
        try:
            label = await provider(lat, lon)
        except UpstreamError:
            logger.warning("request_place_label_unavailable")
            continue
        if label:
            with _lock:
                if len(_cache) >= 200:
                    _cache.pop(next(iter(_cache)))
                _cache[key] = (monotonic(), label)
            return label
    # Polygon containment remains available when providers have no nearby POI or
    # time out. Do not cache this coarse label for an hour: let detail recover.
    return province_labels.resolve(lat, lon)
