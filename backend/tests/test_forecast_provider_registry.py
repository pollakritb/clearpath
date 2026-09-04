from datetime import UTC, datetime, timedelta

from backend.services.forecast_provider_registry import build_provider_summaries


def test_provider_summaries_are_bounded_ordered_and_freshness_aware():
    now = datetime(2026, 9, 4, 12, tzinfo=UTC)
    summaries = build_provider_summaries(
        [
            {
                "provider": "gistda",
                "issued_at": (now - timedelta(hours=6)).isoformat(),
                "horizon_hours": 1,
                "pm25": 20,
            },
            {
                "provider": "openmeteo_cams",
                "issued_at": (now - timedelta(hours=12)).isoformat(),
                "horizon_hours": 12,
                "pm25": 25,
            },
            {
                "provider": "openweather",
                "issued_at": (now - timedelta(hours=2)).isoformat(),
                "horizon_hours": 6,
                "pm25": 22,
            },
        ],
        {"openmeteo_cams"},
        now=now,
    )

    assert [row["source"] for row in summaries] == [
        "gistda",
        "openmeteo_cams",
        "openweather",
    ]
    assert summaries[0]["freshness_status"] == "stale"
    assert summaries[0]["available"] is False
    assert summaries[1]["freshness_status"] == "fresh"
    assert summaries[1]["selected"] is True
    assert summaries[2]["coverage_hours"] == 1
