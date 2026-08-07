from backend.algorithms.ocr_quality import classify_ocr_result


def _result(**overrides):
    result = {
        "available": True,
        "service_error": False,
        "pm25": 42.0,
        "confidence": 0.95,
        "device_detected": True,
        "display_clear": True,
    }
    result.update(overrides)
    return result


def test_ocr_status_requires_complete_high_confidence_evidence():
    assert classify_ocr_result(_result()) == "ready"
    assert classify_ocr_result(_result(confidence=0.84)) == "low_confidence"
    assert classify_ocr_result(_result(pm25=None)) == "no_reading"
    assert classify_ocr_result(_result(display_clear=False)) == "unclear_display"
    assert classify_ocr_result(_result(device_detected=False)) == "no_device"


def test_ocr_status_distinguishes_configuration_and_service_failure():
    assert classify_ocr_result(_result(available=False)) == "unavailable"
    assert (
        classify_ocr_result(_result(available=False, service_error=True))
        == "service_error"
    )
