import base64
import hashlib
import hmac
import json
from types import SimpleNamespace

import httpx
import pytest

from backend.core.config import settings
from backend.services import line_delivery, line_messaging


@pytest.mark.parametrize(
    "status,retryable",
    [
        (400, False),
        (401, False),
        (403, False),
        (409, False),
        (429, True),
        (500, True),
        (503, True),
    ],
)
def test_provider_error_classification(monkeypatch, status, retryable):
    monkeypatch.setattr(settings, "line_durable_delivery_enabled", False)
    monkeypatch.setattr(line_messaging, "_headers", lambda: {})
    monkeypatch.setattr(
        httpx,
        "post",
        lambda url, **_: httpx.Response(status, request=httpx.Request("POST", url)),
    )
    with pytest.raises(line_messaging.LineProviderError) as error:
        line_messaging._post(line_messaging.LINE_PUSH_URL, {}, retry_key="test")
    assert error.value.retryable is retryable
    assert error.value.attempted


def test_webhook_persists_before_ack_and_never_sends(monkeypatch):
    monkeypatch.setattr(settings, "line_messaging_enabled", True)
    monkeypatch.setattr(settings, "line_channel_secret", "secret")
    monkeypatch.setattr(settings, "line_channel_access_token", "token")
    events = [
        {"webhookEventId": "event-1", "timestamp": 1794542400000, "type": "follow"}
    ]
    body = json.dumps({"events": events}).encode()
    sign = base64.b64encode(hmac.new(b"secret", body, hashlib.sha256).digest()).decode()
    calls = []

    class Client:
        def rpc(self, name, params):
            calls.append((name, params))
            return SimpleNamespace(execute=lambda: SimpleNamespace(data=1))

    monkeypatch.setattr(line_delivery.db, "get_client", lambda: Client())
    monkeypatch.setattr(
        httpx, "post", lambda *_args, **_kwargs: pytest.fail("provider I/O in webhook")
    )
    assert line_delivery.accept_webhook(body, sign) == {"accepted": 1}
    assert calls == [("accept_line_webhook", {"p_events": events})]
    with pytest.raises(ValueError):
        line_delivery.accept_webhook(body + b" ", sign)
    assert len(calls) == 1


@pytest.fixture
def worker(monkeypatch):
    from copy import deepcopy
    from datetime import UTC, datetime

    from backend.services import notifications
    from backend.services.community import xp

    row = {
        "id": "1",
        "user_id": "1",
        "attempts": 0,
        "status": "pending",
        "payload": {
            "event_type": "air_alert",
            "title": "original",
            "tag": "nearest:test",
        },
        "frozen_request": None,
        "first_attempt_at": None,
    }
    writes = []

    class Client:
        reject_freeze = False

        def rpc(self, name, params):
            def execute():
                if name == "touch_line_outbox":
                    return SimpleNamespace(data=True)
                if name == "claim_line_outbox":
                    row["lease_token"] = "lease"
                    return SimpleNamespace(data=[deepcopy(row)])
                if name == "finish_line_outbox":
                    writes.append(deepcopy(params["p_values"]))
                    row.update(params["p_values"])
                    return SimpleNamespace(data=True)
                raise AssertionError(name)

            return SimpleNamespace(execute=execute)

        def table(self, name):
            client = self

            class Query:
                def update(self, values):
                    self.values = values
                    return self

                def eq(self, *_):
                    return self

                def gt(self, *_):
                    return self

                def execute(self):
                    if client.reject_freeze:
                        return SimpleNamespace(data=[])
                    row.update(deepcopy(self.values))
                    return SimpleNamespace(data=[row])

            return Query()

    client = Client()
    monkeypatch.setattr(line_delivery.db, "get_client", lambda: client)
    monkeypatch.setattr(xp, "configured", lambda: False)
    monkeypatch.setattr(line_delivery, "_eligible", lambda *_: True)
    monkeypatch.setattr(
        notifications,
        "_delivery_preferences",
        lambda _: {"consent_granted": True, "line_enabled": True},
    )
    monkeypatch.setattr(notifications, "is_quiet_hour", lambda *_: False)
    monkeypatch.setattr(
        line_messaging,
        "prepare_push",
        lambda _, payload: {
            "to": "U1",
            "messages": [{"type": "text", "text": payload["title"]}],
        },
    )
    monkeypatch.setattr(
        line_delivery.supabase_client,
        "get_line_notification_link",
        lambda _: {"active": True, "line_user_id": "U1"},
    )
    return row, writes, client, datetime.now(UTC)


def test_worker_retries_identical_frozen_request_and_key(worker, monkeypatch):
    from copy import deepcopy

    row, writes, _, _ = worker
    calls = []

    def send(request, key):
        calls.append((deepcopy(request), key))
        if len(calls) == 1:
            raise line_messaging.LineProviderError("line_network_error")
        return "accepted"

    monkeypatch.setattr(line_messaging, "post_push", send)
    assert line_delivery.process_outbox()["failed"] == 1
    assert row["frozen_request"] is not None and row["first_attempt_at"]
    row["payload"]["title"] = "changed upstream"
    assert line_delivery.process_outbox()["accepted"] == 1
    assert calls[0] == calls[1]
    assert row["frozen_request"] is None
    assert row["provider_request_id"] == "accepted"


def test_worker_cannot_send_if_freeze_loses_lease(worker, monkeypatch):
    _, writes, client, _ = worker
    client.reject_freeze = True
    monkeypatch.setattr(
        line_messaging, "post_push", lambda *_: pytest.fail("stale lease sent")
    )
    line_delivery.process_outbox()
    assert writes == []


def test_worker_quiet_hours_do_not_consume_attempt_or_freeze(worker, monkeypatch):
    from backend.services import notifications

    row, writes, _, _ = worker
    monkeypatch.setattr(notifications, "is_quiet_hour", lambda *_: True)
    monkeypatch.setattr(
        line_messaging, "post_push", lambda *_: pytest.fail("quiet hours sent")
    )
    line_delivery.process_outbox()
    assert row["attempts"] == 0 and row["first_attempt_at"] is None
    assert writes[-1]["last_error"] == "quiet_hours"


def test_worker_does_not_blind_replay_after_retry_window(worker, monkeypatch):
    from datetime import timedelta

    row, writes, _, now = worker
    row["first_attempt_at"] = (now - timedelta(hours=24)).isoformat()
    monkeypatch.setattr(
        line_messaging, "post_push", lambda *_: pytest.fail("expired key sent")
    )
    line_delivery.process_outbox()
    assert writes[-1]["status"] == "dead"
    assert writes[-1]["last_error"] == "retry_window_expired"


def test_permanent_reply_error_does_not_block_later_user_events(monkeypatch):
    from datetime import UTC, datetime

    writes = []
    row = {
        "event_id": "one",
        "event_at": datetime.now(UTC).isoformat(),
        "lease_token": "lease",
        "attempts": 1,
        "event": {"type": "follow", "replyToken": "one-shot"},
    }

    class Client:
        def rpc(self, name, _params):
            return SimpleNamespace(
                execute=lambda: SimpleNamespace(
                    data=[row] if name == "claim_line_webhooks" else "linked"
                )
            )

        def table(self, _name):
            return self

        def update(self, values):
            writes.append(values)
            return self

        def eq(self, *_):
            return self

        def execute(self):
            return SimpleNamespace(data=[row])

    monkeypatch.setattr(line_delivery.db, "get_client", lambda: Client())

    def invalid_reply(*_):
        raise line_messaging.LineProviderError("line_http_400", retryable=False)

    monkeypatch.setattr(line_messaging, "_reply", invalid_reply)
    result = line_delivery.process_inbox(1)
    assert result["done"] == 1 and result["failed"] == 0
    assert writes[-1]["status"] == "done"
    assert writes[-1]["last_error"] == "line_http_400"
    assert writes[-1]["event"] == {}
