import ssl

from backend.services.air4thai import (
    _CA_BUNDLE_PATH,
    _air4thai_tls_context,
    parse_stations,
)


def test_air4thai_tls_context_keeps_verification_enabled():
    context = _air4thai_tls_context()

    assert context.check_hostname is True
    assert context.verify_mode == ssl.CERT_REQUIRED
    assert (
        _CA_BUNDLE_PATH.read_text(encoding="ascii").count("-----BEGIN CERTIFICATE-----")
        == 2
    )


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


def test_parse_stations_treats_negative_air4thai_sentinel_as_missing():
    rows, diagnostics = parse_stations(
        {
            "stations": [
                {
                    "stationID": "missing-reading",
                    "lat": "13.7",
                    "long": "100.5",
                    "AQILast": {"PM25": {"value": "-1", "aqi": "-1"}},
                }
            ]
        }
    )

    assert diagnostics["accepted_count"] == 1
    assert rows[0]["pm25"] is None
    assert "aqi" not in rows[0]
    assert rows[0]["level"] is None


def test_source_time_is_not_fabricated_from_missing_or_invalid_clock():
    from backend.services.air4thai import _recorded_at

    assert _recorded_at({"date": "2026-11-11"}) is None
    assert _recorded_at({"date": "2026-11-11", "time": "25:00"}) is None
    assert _recorded_at({"date": "not-a-date", "time": "10:00"}) is None
    assert (
        _recorded_at({"date": "2026-11-11", "time": "10:00"})
        == "2026-11-11T10:00:00+07:00"
    )


def test_upstream_aqi_is_ignored_even_when_present():
    rows, _ = parse_stations(
        {
            "stations": [
                {
                    "stationID": "02t",
                    "lat": "13.7",
                    "long": "100.5",
                    "AQILast": {
                        "date": "2026-11-17",
                        "time": "10:00",
                        "PM25": {"value": "22", "aqi": "999"},
                    },
                }
            ]
        }
    )
    assert rows[0]["pm25"] == 22
    assert "aqi" not in rows[0]
    # Bangkok source time and the corresponding UTC instant are identical.
    from datetime import UTC, datetime

    source_time = datetime.fromisoformat(rows[0]["recorded_at"])
    assert source_time.astimezone(UTC).isoformat() == "2026-11-17T03:00:00+00:00"
