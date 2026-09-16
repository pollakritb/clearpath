from datetime import UTC, datetime, timedelta

from backend.algorithms.provider_reliability import rank_provider_evidence


def _row(provider: str, *, rows: int, mae: float, now: datetime, **values):
    return {
        "method": f"provider:{provider}",
        "station_id": "all",
        "district": "all",
        "rows": rows,
        "mae": mae,
        "bias": values.get("bias", 0),
        "false_safe_rate": values.get("false_safe_rate", 0),
        "computed_at": values.get("computed_at", now.isoformat()),
    }


def test_provider_evidence_ranks_accuracy_not_brand():
    now = datetime(2026, 9, 16, 12, tzinfo=UTC)
    result = rank_provider_evidence(
        [
            _row("openmeteo_cams", rows=40, mae=12, now=now),
            _row("openweather", rows=40, mae=8, now=now),
            _row("gistda", rows=40, mae=10, now=now),
        ],
        now=now,
    )

    assert result["basis"] == "retrospective_accuracy"
    assert result["ranked_sources"] == [
        "openweather",
        "gistda",
        "openmeteo_cams",
    ]
    assert result["expires_at"]


def test_provider_evidence_fails_closed_when_stale_or_too_small():
    now = datetime(2026, 9, 16, 12, tzinfo=UTC)
    result = rank_provider_evidence(
        [
            _row("openweather", rows=29, mae=3, now=now),
            _row(
                "openmeteo_cams",
                rows=100,
                mae=4,
                now=now,
                computed_at=(now - timedelta(hours=37)).isoformat(),
            ),
        ],
        now=now,
    )

    assert result["basis"] == "freshness_fallback"
    assert result["ranked_sources"] == []


def test_provider_evidence_expiry_uses_latest_prediction_not_recompute_time():
    now = datetime(2026, 9, 16, 12, tzinfo=UTC)
    row = _row("openweather", rows=100, mae=3, now=now)
    row["metrics"] = {"latest_forecast_at": (now - timedelta(hours=40)).isoformat()}

    result = rank_provider_evidence([row], now=now)

    assert result["basis"] == "freshness_fallback"
    assert result["scores"][0]["eligible"] is False


def test_provider_evidence_ignores_station_rows_and_unrelated_methods():
    now = datetime(2026, 9, 16, 12, tzinfo=UTC)
    station_row = _row("openweather", rows=100, mae=1, now=now)
    station_row["station_id"] = "station-1"
    result = rank_provider_evidence(
        [
            station_row,
            {"method": "xgboost-registry-v2", "computed_at": now.isoformat()},
        ],
        now=now,
    )

    assert result["scores"] == []
