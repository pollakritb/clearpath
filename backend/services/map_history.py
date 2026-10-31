"""Historical station snapshots for the public map."""

from datetime import UTC, datetime

from starlette.concurrency import run_in_threadpool

from ..algorithms.map_history import (
    select_map_history_reports,
    select_map_history_stations,
)
from ..algorithms.report_stacks import group_report_stacks
from . import supabase_client
from .community.constants import PUBLIC_REPORT_MAX_AGE_MINUTES
from .community.presenter import present_report
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


async def get_map_history_community(
    target_at: datetime, stations: list[dict]
) -> tuple[list[dict], list[dict]]:
    raw = await run_in_threadpool(
        supabase_client.get_map_history_reports,
        target_at,
        PUBLIC_REPORT_MAX_AGE_MINUTES,
    )
    selected = select_map_history_reports(
        raw, target_at=target_at, max_age_minutes=PUBLIC_REPORT_MAX_AGE_MINUTES
    )

    def present():
        from .community import xp

        identities = xp.public_identities(selected)
        reports = [
            present_report(
                row,
                identities=identities,
                official_stations=stations,
                approved_reports=selected,
                include_image=True,
                reference_at=target_at,
            )
            for row in selected
        ]
        public = {report["id"]: report for report in reports}
        stacks = group_report_stacks(selected, now=target_at)
        for stack in stacks:
            anchor = public[stack["report_ids"][0]]
            stack["lat"], stack["lon"] = anchor["lat"], anchor["lon"]
        return reports, stacks

    return await run_in_threadpool(present)
