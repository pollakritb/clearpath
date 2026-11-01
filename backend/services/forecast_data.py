"""Compatibility response for the retired model-input collection job.

Public weather and satellite-hotspot APIs use their independent live adapters.
"""

from __future__ import annotations


async def collect_forecast_inputs(stations: list[dict]) -> dict:
    return {"status": "retired", "stations": 0, "weather": 0, "fire_features": 0}
