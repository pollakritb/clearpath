from backend.services import local_store


def test_local_hourly_sync_deduplicates_station_timestamp():
    station_id = "idempotency-test-station"
    reading = {
        "id": station_id,
        "recorded_at": "2026-08-03T01:00:00+00:00",
        "pm25": 17.5,
        "aqi": 22,
    }
    local_store.insert_readings([reading])
    local_store.insert_readings([reading])
    history = local_store.get_history(station_id, 24)
    assert len(history) == 1
    assert history[0]["pm25"] == 17.5
