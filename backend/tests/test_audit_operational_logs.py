import json

from scripts.audit_operational_logs import audit_text


def test_safe_structured_logs_pass_without_echoing_content():
    safe = json.dumps(
        {
            "message": "request_completed",
            "path": "/api/forecast",
            "status": 200,
            "duration_ms": 12.3,
        }
    )
    result = audit_text(safe)
    assert result["passed"] is True
    assert result["json_record_count"] == 1


def test_secret_email_precise_coordinate_and_forbidden_keys_fail():
    unsafe = "\n".join(
        [
            json.dumps({"message": "contact user@example.com token=abc"}),
            json.dumps({"lat": 13.812345, "message": "location"}),
            "Authorization: Bearer abc.def",
        ]
    )
    result = audit_text(unsafe)
    assert result["passed"] is False
    assert result["violation_count"] == 3
    assert all("content" not in row for row in result["violations"])
