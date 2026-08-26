"""Open-Meteo current-weather adapter (no API key required)."""

from __future__ import annotations

import httpx

from ..core.errors import UpstreamError

URL = "https://api.open-meteo.com/v1/forecast"
CURRENT_FIELDS = (
    "temperature_2m,relative_humidity_2m,precipitation,weather_code,"
    "wind_speed_10m,wind_direction_10m"
)


def weather_description(code: int) -> str:
    """Map WMO weather codes to short Thai labels for the mobile UI."""

    if code == 0:
        return "ท้องฟ้าแจ่มใส"
    if code in {1, 2}:
        return "มีเมฆบางส่วน"
    if code == 3:
        return "เมฆมาก"
    if code in {45, 48}:
        return "มีหมอก"
    if code in {51, 53, 55, 56, 57}:
        return "ฝนละออง"
    if code in {61, 63, 65, 66, 67}:
        return "ฝนตก"
    if code in {71, 73, 75, 77}:
        return "หิมะตก"
    if code in {80, 81, 82}:
        return "ฝนตกเป็นช่วง"
    if code in {85, 86}:
        return "หิมะตกเป็นช่วง"
    if code in {95, 96, 99}:
        return "พายุฝนฟ้าคะนอง"
    return "ไม่ทราบสภาพอากาศ"


def _required_number(current: dict, field: str) -> float:
    value = current.get(field)
    if value is None or isinstance(value, bool):
        raise ValueError(f"missing_{field}")
    return float(value)


async def get_weather(lat: float, lon: float) -> dict:
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": CURRENT_FIELDS,
        "wind_speed_unit": "ms",
        "precipitation_unit": "mm",
        "timezone": "auto",
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(URL, params=params)
            response.raise_for_status()
            payload = response.json()
        current = payload.get("current")
        if not isinstance(current, dict):
            raise ValueError("missing_current_weather")
        weather_code = int(_required_number(current, "weather_code"))
        return {
            "temp": _required_number(current, "temperature_2m"),
            "humidity": _required_number(current, "relative_humidity_2m"),
            "wind_speed": _required_number(current, "wind_speed_10m"),
            "wind_deg": _required_number(current, "wind_direction_10m"),
            "description": weather_description(weather_code),
            "icon": None,
            "rain_mm": _required_number(current, "precipitation"),
            "source": "open_meteo",
        }
    except (httpx.HTTPError, TypeError, ValueError) as exc:
        raise UpstreamError("Open-Meteo ตอบกลับไม่สำเร็จหรือข้อมูลสภาพอากาศไม่ถูกต้อง") from exc
