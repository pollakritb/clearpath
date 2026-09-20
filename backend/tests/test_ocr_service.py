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


def test_ocr_sends_private_image_and_clamps_structured_result(monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "server-key")
    monkeypatch.setattr(settings, "openai_ocr_model", "vision-model")
    captured: dict = {}
    response = _Response(_payload({"pm25": 1200}))
    monkeypatch.setattr(
        ocr.httpx,
        "AsyncClient",
        lambda **_kwargs: _Client(response, captured),
    )

    result = asyncio.run(ocr.read_pm25(b"image", "image/jpeg"))

    assert result["pm25"] == 1000.0
    assert result["confidence"] == 1.0
    assert result["raw_text"] == "1000.0"
    assert result["device_detected"] is True
    assert result["display_clear"] is True
    assert captured["json"]["text"]["format"]["schema"] == {
        "type": "object",
        "properties": {"pm25": {"type": ["number", "null"]}},
        "required": ["pm25"],
        "additionalProperties": False,
    }
    assert captured["url"] == ocr.RESPONSES_URL
    assert captured["headers"]["Authorization"] == "Bearer server-key"
    image_url = captured["json"]["input"][0]["content"][1]["image_url"]
    assert image_url == "data:image/jpeg;base64,aW1hZ2U="
    assert captured["json"]["store"] is False


def test_ocr_compares_up_to_three_consecutive_frames(monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "server-key")
    captured: dict = {}
    response = _Response(_payload({"pm25": 23.4}))
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
    assert all(item["detail"] == "high" for item in content[1:])
    assert "ห้ามใช้ค่า AQI" in content[0]["text"]


def test_ocr_allows_null_reading_and_defaults_optional_values(monkeypatch):
    monkeypatch.setattr(settings, "openai_api_key", "server-key")
    response = _Response(_payload({"pm25": None}))
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
