"""1,000 distinct worker fault cases, using real orchestration with offline ports."""

from copy import deepcopy
from datetime import UTC, datetime, timedelta
from itertools import product
from types import SimpleNamespace

import pytest

from backend.services import line_delivery, line_messaging, notifications
from backend.services.community import xp

SCENARIOS = list(
    product(
        range(10),
        ("fresh", "frozen"),
        range(10),
        ("accepted", "timeout", "invalid", "budget", "superseded"),
    )
)
assert len(SCENARIOS) == 1000


@pytest.mark.parametrize(
    "scenario",
    SCENARIOS,
    ids=[
        f"worker-{i:04d}-attempt{row[0]}-{row[1]}-ctx{row[2]}-{row[3]}"
        for i, row in enumerate(SCENARIOS)
    ],
)
def test_worker_failure_matrix(scenario, monkeypatch):
    attempts, phase, context, outcome = scenario
    now = datetime.now(UTC)
    user = str(context + 1)
    row = {
        "id": str(context + 100),
        "user_id": user,
        "attempts": attempts,
        "payload": {
            "event_type": "air_alert",
            "title": f"context-{context}",
            "tag": f"episode-{context}",
        },
        "lease_token": "owner-lease",
        "first_attempt_at": (now - timedelta(minutes=10)).isoformat()
        if phase == "frozen"
        else None,
        "frozen_request": {
            "to": f"U{context}",
            "messages": [{"type": "text", "text": "immutable-original"}],
        }
        if phase == "frozen"
        else None,
    }
    original = deepcopy(row["frozen_request"])
    finishes = []
    sends = []
    budgets = []

    class Client:
        def rpc(self, name, params):
            def execute():
                if name == "claim_line_outbox":
                    return SimpleNamespace(data=[deepcopy(row)])
                if name == "touch_line_outbox":
                    return SimpleNamespace(data=True)
                if name == "finish_line_outbox":
                    assert params["p_lease"] == "owner-lease"
                    finishes.append(deepcopy(params["p_values"]))
                    return SimpleNamespace(data=True)
                pytest.fail(f"unexpected RPC {name}")

            return SimpleNamespace(execute=execute)

        def table(self, _name):
            class Query:
                def update(self, values):
                    self.values = values
                    return self

                def eq(self, *_):
                    return self

                def gt(self, *_):
                    return self

                def execute(self):
                    row.update(deepcopy(self.values))
                    return SimpleNamespace(data=[row])

            return Query()

    monkeypatch.setattr(line_delivery.db, "get_client", lambda: Client())
    monkeypatch.setattr(xp, "configured", lambda: False)
    monkeypatch.setattr(line_delivery, "_eligible", lambda *_: outcome != "superseded")
    monkeypatch.setattr(
        notifications,
        "_delivery_preferences",
        lambda _: {"consent_granted": True, "line_enabled": True},
    )
    monkeypatch.setattr(notifications, "is_quiet_hour", lambda *_: False)
    monkeypatch.setattr(
        line_delivery.supabase_client,
        "get_line_notification_link",
        lambda _: {"active": True, "line_user_id": f"U{context}"},
    )
    monkeypatch.setattr(
        line_messaging,
        "prepare_push",
        lambda _, payload: {
            "to": f"U{context}",
            "messages": [{"type": "text", "text": payload["title"]}],
        },
    )

    def budget(_):
        budgets.append(1)
        if outcome == "budget":
            raise line_messaging.LineProviderError(
                "line_budget_deferred", attempted=False, retry_after=60
            )

    monkeypatch.setattr(line_messaging, "reserve_budget", budget)

    def send(request, key):
        sends.append((deepcopy(request), key))
        if outcome == "timeout":
            raise line_messaging.LineProviderError("line_network_error")
        if outcome == "invalid":
            raise line_messaging.LineProviderError("line_http_400", retryable=False)
        return "provider-accepted"

    monkeypatch.setattr(line_messaging, "post_push", send)
    line_delivery.process_outbox(1)
    assert len(finishes) == 1
    final = finishes[0]
    if outcome == "superseded":
        assert final["status"] == "dead" and not sends and not budgets
    elif outcome == "budget":
        assert final["attempts"] == attempts and not sends
        if phase == "fresh":
            assert row["frozen_request"] is None and row["first_attempt_at"] is None
    elif outcome == "accepted":
        assert (
            final["status"] == "sent"
            and final["provider_request_id"] == "provider-accepted"
        )
    elif outcome == "invalid":
        assert final["status"] == "dead" and final["last_error"] == "line_http_400"
    else:
        assert final["status"] == ("dead" if attempts + 1 >= 8 else "failed")
        assert final["attempts"] == attempts + 1
    if sends and phase == "frozen":
        assert sends[0][0] == original, "retry changed recipient or message body"
    if sends:
        assert len(budgets) == 1
