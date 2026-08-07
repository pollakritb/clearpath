from backend.services.air4thai import parse_stations


def test_parse_stations_audits_every_rejected_row():
    rows, diagnostics = parse_stations(
        {
            "stations": [
                {
                    "stationID": "ok",
                    "nameTH": "สถานีทดสอบ",
                    "lat": "13.7",
                    "long": "100.5",
                    "areaTH": "กรุงเทพมหานคร",
                    "AQILast": {
                        "date": "2026-08-07",
                        "time": "07:00",
                        "PM25": {"value": "22", "aqi": "42"},
                    },
                },
                {"stationID": "missing-coordinates", "lat": None, "long": None},
                {"stationID": "bad-range", "lat": "120", "long": "100"},
                {"stationID": "", "lat": "13", "long": "100"},
            ]
        }
    )

    assert [row["id"] for row in rows] == ["ok"]
    assert diagnostics["fetched_count"] == 4
    assert diagnostics["accepted_count"] == 1
    assert diagnostics["rejected_count"] == 3
    assert diagnostics["rejection_counts"] == {
        "invalid_coordinates": 1,
        "coordinates_out_of_range": 1,
        "missing_station_id": 1,
    }
