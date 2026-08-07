"""Small, dependency-free production logging helpers."""

from __future__ import annotations

import json
import logging
import re
from datetime import UTC, datetime

from .config import settings

_REDACTIONS = (
    (re.compile(r"(?i)(bearer\s+)[^\s,;]+"), r"\1[REDACTED]"),
    (
        re.compile(r"(?i)(api[_-]?key|token|secret|password)(\s*[:=]\s*)[^\s,;]+"),
        r"\1\2[REDACTED]",
    ),
    (re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}"), "[REDACTED_EMAIL]"),
    (
        re.compile(r"(?i)(lat|latitude|lon|lng|longitude)(\s*[:=]\s*)-?\d+(?:\.\d+)?"),
        r"\1\2[REDACTED_COORDINATE]",
    ),
)


def redact_log_message(value: object) -> str:
    message = str(value)
    for pattern, replacement in _REDACTIONS:
        message = pattern.sub(replacement, message)
    return message


class JsonFormatter(logging.Formatter):
    """Emit machine-readable logs without request bodies or credentials."""

    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": redact_log_message(record.getMessage()),
            "environment": settings.app_environment,
            "release": settings.current_release,
        }
        for field in (
            "request_id",
            "method",
            "path",
            "status",
            "duration_ms",
            "source",
            "horizon_hours",
            "alert_codes",
        ):
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value
        if record.exc_info:
            payload["exception_type"] = record.exc_info[0].__name__
        return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def configure_logging() -> None:
    """Install one ClearPath JSON handler while respecting hosting log capture."""

    logger = logging.getLogger("clearpath")
    if not any(
        getattr(handler, "_clearpath_handler", False) for handler in logger.handlers
    ):
        handler = logging.StreamHandler()
        handler.setFormatter(JsonFormatter())
        handler._clearpath_handler = True  # type: ignore[attr-defined]
        logger.addHandler(handler)
    logger.setLevel(getattr(logging, settings.log_level.upper(), logging.INFO))
    logger.propagate = False
