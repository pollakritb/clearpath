"""Leading zeros and decimal separators must preserve the meter's scale."""

import pytest

from backend.algorithms.ocr_reading import parse_pm25_display


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("017", 17),
        ("0017", 17),
        ("000", 0),
        ("0.17", 0.17),
        ("017.0", 17),
        ("17.5", 17.5),
        ("17,5", 17.5),
        (" 017 ", 17),
        ("０１７", 17),
        ("1000", 1000),
        ("1200", 1200),
    ],
)
def test_literal_display_preserves_decimal_scale(text, expected):
    assert parse_pm25_display(text) == expected


@pytest.mark.parametrize(
    "text",
    [
        None,
        0.17,
        True,
        "",
        "0.1.7",
        "017 31",
        "17 µg/m³",
        "1e2",
        "NaN",
        "inf",
        "-17",
        "9" * 40,
    ],
)
def test_unreadable_or_invalid_tokens_are_not_guessed(text):
    assert parse_pm25_display(text) is None
