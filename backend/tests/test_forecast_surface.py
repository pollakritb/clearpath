from backend.algorithms.forecast_surface import forecast_surface, surface_cell


def test_surface_cell_uses_exact_station_value_and_haversine_coverage():
    stations = [
        {"lat": 13.8, "lon": 100.0, "pm25": 30, "lower": 20, "upper": 40},
        {"lat": 13.9, "lon": 100.1, "pm25": 50, "lower": 40, "upper": 60},
    ]
    cell = surface_cell(13.8, 100.0, stations)
    assert cell["coverage"] == "covered"
    assert cell["pm25"] == 30
    assert cell["lower"] == 20


def test_surface_masks_cells_too_far_from_official_stations():
    cell = surface_cell(
        13.8,
        100.0,
        [{"lat": 15.0, "lon": 101.0, "pm25": 30, "lower": 20, "upper": 40}],
    )
    assert cell["coverage"] == "unavailable"
    assert cell["pm25"] is None


def test_surface_grid_excludes_points_outside_service_polygon():
    polygon = ((100.0, 13.0), (100.2, 13.0), (100.2, 13.2), (100.0, 13.2))
    result = forecast_surface(
        [{"lat": 13.1, "lon": 100.1, "pm25": 30, "lower": 20, "upper": 40}],
        grid_size=4,
        polygon=polygon,
    )
    assert 0 < len(result["cells"]) < 16
    assert sum(result["coverage_counts"].values()) == len(result["cells"])
