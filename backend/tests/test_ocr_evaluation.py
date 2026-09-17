from backend.algorithms.ocr_evaluation import OcrEvaluationGate, evaluate_ocr_cases


def _row(case_id: int, *, negative: bool = False, wrong: bool = False) -> dict:
    expected = None if negative else float(case_id % 100)
    predicted = 50.0 if negative else expected
    if wrong and expected is not None:
        predicted = expected + 30
    conditions = ["normal"]
    if case_id < 6:
        conditions = [
            ["normal", "glare", "blur", "low_light", "rotated", "not_a_meter"][case_id]
        ]
    return {
        "case_id": str(case_id),
        "expected_pm25": expected,
        "device_family": f"family-{case_id % 3}",
        "conditions": conditions,
        "predicted_pm25": predicted,
        "predicted_confidence": 0.99,
        "predicted_device_detected": not negative,
        "predicted_display_clear": not negative,
    }


def test_complete_accurate_dataset_passes_release_gate():
    rows = [_row(index, negative=index >= 50) for index in range(60)]

    result = evaluate_ocr_cases(rows)

    assert result["passed"] is True
    assert result["metrics"]["mae"] == 0
    assert result["metrics"]["high_confidence_precision"] == 1
    assert result["metrics"]["negative_false_positive_rate"] == 0


def test_small_dataset_cannot_authorize_model_change():
    result = evaluate_ocr_cases([_row(0)])

    assert result["passed"] is False
    assert "insufficient_total_cases" in result["failure_codes"]
    assert "insufficient_negative_cases" in result["failure_codes"]


def test_high_confidence_wrong_reading_fails_precision_gate():
    rows = [_row(index, negative=index >= 50) for index in range(60)]
    rows[12] = _row(12, wrong=True)

    result = evaluate_ocr_cases(rows)

    assert result["passed"] is False
    assert "high_confidence_precision_below_limit" in result["failure_codes"]


def test_gate_is_configurable_for_small_local_unit_fixtures():
    gate = OcrEvaluationGate(
        minimum_cases=1,
        minimum_readable_cases=1,
        minimum_negative_cases=0,
        minimum_device_families=1,
        minimum_high_confidence_precision=1,
    )
    row = _row(0)
    row["conditions"] = [
        "normal",
        "glare",
        "blur",
        "low_light",
        "rotated",
        "not_a_meter",
    ]

    result = evaluate_ocr_cases([row], gate)

    assert result["passed"] is False
    assert result["failure_codes"] == ["negative_false_positive_rate_above_limit"]
