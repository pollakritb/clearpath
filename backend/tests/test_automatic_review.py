from backend.algorithms.automatic_review import evaluate_automatic_review


def _review(**overrides):
    values = {"ocr_pm25": 42.0}
    values.update(overrides)
    return evaluate_automatic_review(**values)


def test_numeric_ocr_reading_is_approved_automatically():
    result = _review()

    assert result["approved"] is True
    assert result["verified_pm25"] == 42.0
    assert result["reasons"]


def test_missing_ocr_number_is_rejected_with_retake_instruction():
    result = _review(ocr_pm25=None)

    assert result["approved"] is False
    assert result["verified_pm25"] is None
    assert "ถ่ายภาพใหม่" in result["reasons"][0]


def test_numeric_ocr_reading_does_not_depend_on_other_evidence_signals():
    result = _review(ocr_pm25=40.0)

    assert result["approved"] is True
    assert result["verified_pm25"] == 40.0


def test_ocr_value_is_clamped_to_supported_range():
    result = _review(ocr_pm25=1200.0)

    assert result["approved"] is True
    assert result["verified_pm25"] == 1000.0
