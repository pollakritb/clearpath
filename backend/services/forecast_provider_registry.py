"""Provider metadata and presentation helpers for the public forecast contract."""

from __future__ import annotations

from datetime import UTC, datetime

from ..algorithms.forecast_selection import EXTERNAL_PROVIDERS

PROVIDERS = {
    "gistda": {
        "label": "GISTDA เช็คฝุ่น",
        "attribution": "GISTDA",
        "attribution_url": "https://pm25.gistda.or.th/",
        "maximum_horizon_hours": 3,
        "stale_after_hours": 5,
        "usage_note": "แบบจำลองเช็คฝุ่นสำหรับตำแหน่งในประเทศไทย",
    },
    "openmeteo_cams": {
        "label": "CAMS / Open-Meteo",
        "attribution": "CAMS ENSEMBLE via Open-Meteo",
        "attribution_url": "https://open-meteo.com/en/docs/air-quality-api",
        "maximum_horizon_hours": 120,
        "stale_after_hours": 14,
        "usage_note": "แบบจำลองบรรยากาศระดับภูมิภาค ไม่ใช่เครื่องวัด ณ จุดนั้น",
    },
    "openweather": {
        "label": "OpenWeather Air Pollution",
        "attribution": "OpenWeather",
        "attribution_url": "https://openweathermap.org/api/air-pollution",
        "maximum_horizon_hours": 96,
        "stale_after_hours": 10,
        "usage_note": "แบบจำลองคุณภาพอากาศรายชั่วโมงตามพิกัด",
    },
}


def _parse_datetime(value: object) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def build_provider_summaries(
    snapshots: list[dict], selected_sources: set[str], *, now: datetime
) -> list[dict]:
    """Build stable, at-most-three external provider summaries."""

    summaries = []
    for source in EXTERNAL_PROVIDERS:
        metadata = PROVIDERS[source]
        rows = [row for row in snapshots if str(row.get("provider")) == source]
        issued_values = [
            parsed
            for row in rows
            if (parsed := _parse_datetime(row.get("issued_at"))) is not None
        ]
        latest = max(issued_values) if issued_values else None
        age_minutes = (
            max(0.0, (now - latest).total_seconds() / 60.0) if latest else None
        )
        fresh = (
            age_minutes is not None
            and age_minutes <= float(metadata["stale_after_hours"]) * 60
        )
        forecast_hours = {
            int(row.get("horizon_hours") or 0)
            for row in rows
            if row.get("pm25") is not None and fresh
        }
        summaries.append(
            {
                "source": source,
                "label": metadata["label"],
                "attribution": metadata["attribution"],
                "attribution_url": metadata["attribution_url"],
                "available": bool(forecast_hours),
                "selected": source in selected_sources,
                "latest_issued_at": latest.isoformat() if latest else None,
                "freshness_status": (
                    "fresh"
                    if fresh and forecast_hours
                    else "stale"
                    if rows
                    else "unavailable"
                ),
                "coverage_hours": len(forecast_hours),
                "maximum_horizon_hours": metadata["maximum_horizon_hours"],
                "stale_after_hours": metadata["stale_after_hours"],
                "usage_note": metadata["usage_note"],
            }
        )
    return summaries
