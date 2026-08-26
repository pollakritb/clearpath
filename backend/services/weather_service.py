"""Current-weather provider selection with a keyless fallback."""

from __future__ import annotations

import logging

from ..core.errors import ConfigurationError, UpstreamError
from . import openmeteo_weather, openweather

logger = logging.getLogger(__name__)


async def get_weather(lat: float, lon: float) -> dict:
    """Prefer OpenWeather when configured, then fall back to Open-Meteo."""

    try:
        weather = await openweather.get_weather(lat, lon)
        return {**weather, "source": "openweather"}
    except ConfigurationError:
        pass
    except UpstreamError as exc:
        logger.warning("weather_primary_unavailable: %s", exc)
    return await openmeteo_weather.get_weather(lat, lon)
