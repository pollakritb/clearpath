"""Retrying a producer must preserve acknowledged inbox/delivery state."""

from types import SimpleNamespace

from backend.services import store_notifications as store


class ExistingRows:
    def __init__(self, saved):
        self.saved = saved
        self.rows = []

    def table(self, name):
        self.name = name
        return self

    def upsert(self, row, *, on_conflict, ignore_duplicates=False):
        saved = self.saved[self.name]
        keys = on_conflict.split(",")
        assert all(saved[key] == row[key] for key in keys)
        if not ignore_duplicates:
            saved.update(row)
        self.rows = [] if ignore_duplicates else [dict(saved)]
        return self

    def select(self, _):
        self.rows = [dict(self.saved[self.name])]
        return self

    def eq(self, key, value):
        self.rows = [row for row in self.rows if row[key] == value]
        return self

    def limit(self, _):
        return self

    def execute(self):
        return SimpleNamespace(data=self.rows)


def test_replay_preserves_read_notification_and_successfully_sent_delivery(monkeypatch):
    monkeypatch.setattr(store.settings, "local_demo_mode", False)
    saved = {
        "user_notifications": {
            "id": "NTF-000001",
            "user_id": "user",
            "deduplication_key": "report:1",
            "read_at": "2026-11-01",
            "title": "original",
        },
        "notification_outbox": {
            "id": "OBX-000001",
            "event_key": "report:1:line",
            "status": "sent",
            "attempts": 2,
        },
    }
    monkeypatch.setattr(store.db, "get_client", lambda: ExistingRows(saved))
    result = store.create_user_notification(
        {
            "id": "NTF-000099",
            "user_id": "user",
            "deduplication_key": "report:1",
            "read_at": None,
            "title": "retry",
        }
    )
    store.create_outbox_event(
        {
            "id": "OBX-000099",
            "event_key": "report:1:line",
            "status": "pending",
            "attempts": 0,
        }
    )
    assert result["id"] == "NTF-000001"
    assert result["read_at"] == "2026-11-01"
    assert result["title"] == "original"
    assert saved["notification_outbox"]["status"] == "sent"
    assert saved["notification_outbox"]["attempts"] == 2
