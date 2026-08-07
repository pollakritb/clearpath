from scripts.measure_forecast_runtime import summarize


def test_runtime_summary_reports_availability_latency_and_fallback_rate():
    result = summarize(
        [
            {"status": 200, "duration_ms": 10, "bytes": 100, "fallback_reason": None},
            {
                "status": 200,
                "duration_ms": 30,
                "bytes": 120,
                "fallback_reason": "ml_forecast_disabled",
            },
            {"status": 502, "duration_ms": 20, "bytes": 20, "fallback_reason": None},
        ],
        "2026-08-03T00:00:00+00:00",
        "2026-08-03T00:01:00+00:00",
    )
    assert result["ready"] is False
    assert result["availability"] == 2 / 3
    assert result["latency_ms"]["median"] == 20
    assert result["fallback_rate"] == 0.5
    assert result["status_counts"] == {"200": 2, "502": 1}
