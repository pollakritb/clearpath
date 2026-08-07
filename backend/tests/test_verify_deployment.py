from scripts.verify_deployment import baseline_fallback_valid


def test_baseline_fallback_requires_disabled_reason_and_no_model_metadata():
    forecast = {
        "model_version": None,
        "artifact_sha256": None,
        "fallback_reason_codes": ["ml_forecast_disabled"],
        "points": [
            {"model_version": None, "artifact_sha256": None},
            {"model_version": None, "artifact_sha256": None},
        ],
    }
    assert baseline_fallback_valid(
        current_status=200, forecast_status=200, forecast=forecast
    )

    forecast["points"][1]["model_version"] = "unexpected-model"
    assert not baseline_fallback_valid(
        current_status=200, forecast_status=200, forecast=forecast
    )
