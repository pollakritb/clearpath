from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from backend.core.config import settings
from backend.services import account_erasure


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setattr(settings, "local_demo_mode", False)
    monkeypatch.setattr(settings, "account_privacy_enabled", True)
    client = MagicMock()
    monkeypatch.setattr(account_erasure.db, "get_client", lambda: client)
    job = {
        "request_id": "request",
        "auth_user_id": "auth-owner",
        "image_paths": ["private/draft.jpg"],
    }
    completed = {"id": "request", "status": "completed", "completed_at": "2026-11-14"}
    client.rpc.return_value.execute.side_effect = [
        SimpleNamespace(data=[job]),
        SimpleNamespace(data=completed),
    ]
    return client


def test_media_removed_before_auth_and_completion(client):
    order = []
    client.storage.from_.return_value.remove.side_effect = lambda _: order.append(
        "storage"
    )
    client.auth.admin.delete_user.side_effect = lambda _: order.append("auth")
    result = account_erasure.process(request_id="request")
    assert order == ["storage", "auth"]
    assert result["request"]["status"] == "completed"
    assert result["processed"] == 1
    client.auth.admin.delete_user.assert_called_once_with("auth-owner")
    assert client.rpc.call_args.args == (
        "complete_account_erasure",
        {"p_request": "request"},
    )


@pytest.mark.parametrize("failure", ["storage", "auth"])
def test_external_failure_keeps_job_pending_and_never_completes(client, failure):
    if failure == "storage":
        client.storage.from_.return_value.remove.side_effect = RuntimeError(
            "private error"
        )
    else:
        client.auth.admin.delete_user.side_effect = RuntimeError("private error")
    assert account_erasure.process() == {"processed": 0, "failed": 1}
    assert client.rpc.call_count == 1
    if failure == "storage":
        client.auth.admin.delete_user.assert_not_called()


def test_retry_after_auth_was_already_removed(client):
    class MissingUser(Exception):
        status = 404

    client.auth.admin.delete_user.side_effect = MissingUser()
    assert account_erasure.process()["processed"] == 1


def test_queue_unavailable_is_retryable(client):
    client.rpc.return_value.execute.side_effect = RuntimeError()
    assert account_erasure.process() == {"processed": 0, "failed": 1}
    client.auth.admin.delete_user.assert_not_called()


def test_disabled_never_touches_auth_or_storage(client, monkeypatch):
    monkeypatch.setattr(settings, "account_privacy_enabled", False)
    assert account_erasure.process() == {"processed": 0, "failed": 0}
    client.rpc.assert_not_called()
