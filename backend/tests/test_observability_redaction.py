import json
import logging

from backend.core.observability import JsonFormatter, redact_log_message


def test_log_message_redacts_secrets_email_and_precise_coordinates():
    message = redact_log_message(
        "Bearer abc token=xyz user@example.com lat=13.812345 lon:100.123456"
    )
    assert "abc" not in message
    assert "xyz" not in message
    assert "user@example.com" not in message
    assert "13.812345" not in message
    assert "100.123456" not in message


def test_json_formatter_only_emits_allowlisted_structured_fields():
    record = logging.LogRecord("clearpath.test", logging.WARNING, "", 0, "ok", (), None)
    record.alert_codes = ["forecast_bias_high"]
    record.private_image_path = "private/report.jpg"
    payload = json.loads(JsonFormatter().format(record))
    assert payload["alert_codes"] == ["forecast_bias_high"]
    assert "private_image_path" not in payload
