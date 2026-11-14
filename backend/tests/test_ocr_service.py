from __future__ import annotations

import asyncio
import json

import httpx
import pytest

from backend.core.config import settings
from backend.core.errors import UpstreamError
from backend.services import ocr


class _Response:
    def __init__(self, payload: dict, *, fail: bool = False):
        self.payload = payload
        self.fail = fail

    def raise_for_status(self) -> None:
        if self.fail:
            raise httpx.ConnectError(
                "OpenAI unavailable",
                request=httpx.Request("POST", ocr.RESPONSES_URL),
            )

    def json(self) -> dict:
        return self.payload


class _Client:
    def __init__(self, response: _Response, captured: dict):
        self.response = response
        self.captured = captured

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    async def post(self, url: str, **kwargs):
        self.captured.update({"url": url, **kwargs})
        return self.response


def _payload(value: dict) -> dict:
    return {
        "output": [
            {
                "type": "message",
                "content": [{"type": "output_text", "text": json.dumps(value)}],
            }
        ]
    }


def test_ocr_is_explicitly_unavailable_without_server_key(monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "")
    result = asyncio.run(ocr.read_pm25(b"image", "image/jpeg"))
    assert result == {
        "available": False,
        "pm25": None,
        "confidence": 0.0,
        "device_detected": False,
        "display_clear": False,
        "raw_text": "",
    }


def test_ocr_sends_private_image_and_parses_literal_display(monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "server-key")
    monkeypatch.setattr(settings, "openai_ocr_model", "vision-model")
    captured: dict = {}
    response = _Response(_payload({"pm25_text": "0017"}))
    monkeypatch.setattr(
        ocr.httpx,
        "AsyncClient",
        lambda **_kwargs: _Client(response, captured),
    )

    result = asyncio.run(ocr.read_pm25(b"image", "image/jpeg"))

    assert result["pm25"] == 17.0
    assert result["confidence"] == 1.0
    assert result["raw_text"] == "0017"
    assert result["device_detected"] is True
    assert result["display_clear"] is True
    schema = captured["json"]["text"]["format"]["schema"]
    assert schema["required"] == ["pm25_text"]
    assert schema["properties"]["pm25_text"]["type"] == ["string", "null"]
    assert "pm25" not in schema["properties"]
    assert captured["url"] == ocr.RESPONSES_URL
    assert captured["headers"]["Authorization"] == "Bearer server-key"
    image_url = captured["json"]["input"][0]["content"][1]["image_url"]
    assert image_url == "data:image/jpeg;base64,aW1hZ2U="
    assert captured["json"]["store"] is False


def test_ocr_compares_up_to_three_consecutive_frames(monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "server-key")
    monkeypatch.setattr(settings, "openai_ocr_model", "gpt-5.4-mini")
    captured: dict = {}
    response = _Response(_payload({"pm25_text": "23.4"}))
    monkeypatch.setattr(
        ocr.httpx,
        "AsyncClient",
        lambda **_kwargs: _Client(response, captured),
    )

    result = asyncio.run(
        ocr.read_pm25(
            b"primary",
            "image/jpeg",
            additional_images=[
                (b"second", "image/png"),
                (b"third", "image/webp"),
                (b"ignored", "image/jpeg"),
            ],
        )
    )

    assert result["pm25"] == 23.4
    content = captured["json"]["input"][0]["content"]
    assert [item["type"] for item in content] == [
        "input_text",
        "input_image",
        "input_image",
        "input_image",
    ]
    assert all(item["detail"] == "original" for item in content[1:])
    assert "ห้ามใช้ค่า AQI" in content[0]["text"]


def test_ocr_allows_null_reading_and_defaults_optional_values(monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "server-key")
    response = _Response(_payload({"pm25_text": None}))
    monkeypatch.setattr(
        ocr.httpx,
        "AsyncClient",
        lambda **_kwargs: _Client(response, {}),
    )
    result = asyncio.run(ocr.read_pm25(b"image", "image/png"))
    assert result["pm25"] is None
    assert result["confidence"] == 0.0
    assert result["device_detected"] is False
    assert result["display_clear"] is False


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"output": [{"type": "tool_call"}]},
        {"output": [{"type": "message", "content": [{"type": "refusal"}]}]},
    ],
)
def test_ocr_rejects_missing_or_refused_output(payload):
    with pytest.raises(UpstreamError):
        ocr._output_text(payload)


@pytest.mark.parametrize(
    "response",
    [
        _Response({}, fail=True),
        _Response(
            {
                "output": [
                    {
                        "type": "message",
                        "content": [{"type": "output_text", "text": "not-json"}],
                    }
                ]
            }
        ),
    ],
)
def test_ocr_normalizes_transport_and_json_failures(monkeypatch, response):
    monkeypatch.setattr(settings, "openai_api_key", "server-key")
    monkeypatch.setattr(
        ocr.httpx,
        "AsyncClient",
        lambda **_kwargs: _Client(response, {}),
    )
    with pytest.raises(UpstreamError):
        asyncio.run(ocr.read_pm25(b"image", "image/jpeg"))


@pytest.mark.parametrize(
    ("text", "expected"), [("017", 17.0), ("0.17", 0.17), ("1200", 1000.0)]
)
def test_ocr_keeps_leading_zero_reading_distinct_from_real_decimal(
    monkeypatch, text, expected
):
    monkeypatch.setattr(settings, "openai_api_key", "server-key")
    monkeypatch.setattr(settings, "community_v2_enabled", True)
    captured = {}
    response = _Response(
        _payload(
            {"pm25_text": text, "pm25_field_verified": False, "unit_verified": None}
        )
    )
    monkeypatch.setattr(
        ocr.httpx, "AsyncClient", lambda **kwargs: _Client(response, captured)
    )
    result = asyncio.run(ocr.read_pm25(b"image", "image/jpeg"))
    assert result["pm25"] == expected
    assert result["raw_text"] == text
    assert result["confidence"] == 1.0
    assert result["evidence_extraction"]["pm25_field_verified"] is False
    prompt = captured["json"]["input"][0]["content"][0]["text"]
    assert 'หน้าจอ 017 ต้องคืนข้อความ "017"' in prompt
    assert "ห้ามแทรก ย้าย หรือลบจุดทศนิยม" in prompt
