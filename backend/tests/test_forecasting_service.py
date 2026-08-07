from backend.services import forecasting


def test_surface_contract_is_hard_gated_to_official_stations(monkeypatch):
    monkeypatch.setattr(forecasting.supabase_client, "get_stations", lambda: [])

    response, ledgers = forecasting.surface_forecast(1, 4)

    assert response["source_policy"] == "official_stations_only"
    assert response["station_count"] == 0
    assert response["coverage_counts"]["unavailable"] == len(response["cells"])
    assert ledgers == []
