"""Read-only operational health boundary for the Admin console."""

from ..algorithms.data_health import summarize_data_health
from ..core.errors import UpstreamError
from . import supabase_client


def get_data_health() -> dict:
    try:
        stations = supabase_client.get_stations()
        sync_runs = supabase_client.list_sync_runs(50)
    except Exception as exc:
        raise UpstreamError("data_health_unavailable") from exc
    return summarize_data_health(stations, sync_runs)
