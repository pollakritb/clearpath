"""Current weather from Open-Meteo."""

from . import openmeteo_weather


async def get_weather(lat: float, lon: float) -> dict:
    return await openmeteo_weather.get_weather(lat, lon)
