"""Historical station snapshots for the public map."""

from datetime import UTC, datetime

from starlette.concurrency import run_in_threadpool

from ..algorithms.map_history import select_map_history_stations
from . import supabase_client
from .stations import get_current_stations


async def get_map_history(
    target_at: datetime, *, max_age_minutes: int = 90
) -> list[dict]:
    target = target_at
    if target.tzinfo is None:
        target = target.replace(tzinfo=UTC)
    target = target.astimezone(UTC)
    stations, _source = await get_current_stations()
    readings = await run_in_threadpool(
        supabase_client.get_map_history_readings,
        target,
        max_age_minutes,
    )
    return select_map_history_stations(
        stations,
        readings,
        target_at=target,
        max_age_minutes=max_age_minutes,
    )
