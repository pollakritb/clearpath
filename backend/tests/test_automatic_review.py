from backend.algorithms.automatic_review import evaluate_automatic_review


def _review(**overrides):
    values = {
        "enabled": True,
        "ocr_pm25": 42.0,
        "ocr_confidence": 0.97,
        "device_detected": True,
        "display_clear": True,
        "claimed_pm25": 43.0,
        "duplicate_detected": False,
        "clock_warning": False,
        "gps_accuracy_m": 25.0,
        "burst_frame_count": 2,
    }
    values.update(overrides)
    return evaluate_automatic_review(**values)


def test_high_confidence_evidence_is_approved_automatically():
    result = _review()

    assert result["approved"] is True
    assert result["verified_pm25"] == 42.0
    assert result["reasons"]


def test_uncertain_evidence_falls_back_to_manual_review():
    result = _review(
        ocr_confidence=0.80,
        display_clear=False,
        gps_accuracy_m=140,
        burst_frame_count=0,
    )

    assert result["approved"] is False
    assert result["verified_pm25"] is None
    assert len(result["reasons"]) == 4


def test_claimed_value_must_agree_with_ocr_for_automatic_approval():
    result = _review(ocr_pm25=40.0, claimed_pm25=55.0)

    assert result["approved"] is False
    assert any("ต่างจาก OCR" in reason for reason in result["reasons"])


def test_duplicate_or_clock_warning_always_falls_back():
    result = _review(duplicate_detected=True, clock_warning=True)

    assert result["approved"] is False
    assert len(result["reasons"]) == 2
