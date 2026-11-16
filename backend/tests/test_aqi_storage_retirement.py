"""Retired upstream AQI cannot re-enter storage through a retry or old caller."""

from types import SimpleNamespace
from unittest.mock import MagicMock

from backend.services import store_stations


def test_station_and_history_writes_ignore_old_aqi_payload(monkeypatch):
    monkeypatch.setattr(store_stations.settings, "local_demo_mode", False)
    client = MagicMock()
    monkeypatch.setattr(store_stations.db, "get_client", lambda: client)
    source = {
        "id": "02t",
        "pm25": 22,
        "aqi": 999,
        "recorded_at": "2026-11-17T10:00:00+07:00",
    }
    store_stations.upsert_stations([source])
    store_stations.insert_readings([source])
    calls = client.table.return_value.upsert.call_args_list
    assert len(calls) == 2
    assert all("aqi" not in call.args[0][0] for call in calls)
    assert all(call.args[0][0]["pm25"] == 22 for call in calls)


def test_history_reads_do_not_request_removed_column(monkeypatch):
    monkeypatch.setattr(store_stations.settings, "local_demo_mode", False)
    client = MagicMock()
    monkeypatch.setattr(store_stations.db, "get_client", lambda: client)
    monkeypatch.setattr(
        store_stations.db,
        "_execute_read",
        lambda read: (read(), SimpleNamespace(data=[]))[1],
    )
    from datetime import UTC, datetime

    store_stations.get_history("02t")
    store_stations.get_map_history_readings(datetime.now(UTC))
    assert all(
        "aqi" not in call.args[0].split(",")
        for call in client.table.return_value.select.call_args_list
    )
