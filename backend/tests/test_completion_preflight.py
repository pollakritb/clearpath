from backend.core.config import Settings
from scripts.production_preflight import optional_tables


def test_disabled_new_features_need_no_unapplied_tables():
    config = Settings(
        _env_file=None,
        reporter_trust_enabled=False,
        account_privacy_enabled=False,
        cams_grid_collection_enabled=False,
    )
    assert optional_tables(config) == ()


def test_enabled_features_require_their_private_storage():
    config = Settings(
        _env_file=None,
        reporter_trust_enabled=True,
        account_privacy_enabled=True,
        cams_grid_collection_enabled=True,
    )
    tables = optional_tables(config)
    assert {
        "community_reporter_audits",
        "community_reporter_review_requests",
        "account_privacy_requests",
        "cams_grid_jobs",
        "cams_grid_active",
    } <= set(tables)
    assert len(tables) == len(set(tables))


def test_grid_job_reads_immutable_creation_time_not_scheduler_slot(monkeypatch):
    from backend.services import forecast_grid_store

    observed = []

    class Query:
        def select(self, columns):
            observed.append(columns)
            return self

        def eq(self, key, value):
            observed.append((key, value))
            return self

        def limit(self, n):
            return [{"created_at": "2026-11-06T09:59:00+00:00"}]

    monkeypatch.setattr(
        forecast_grid_store, "read", lambda table, configure: configure(Query())
    )
    assert forecast_grid_store.job_start("CGJ-000001") == "2026-11-06T09:59:00+00:00"
    assert observed == ["created_at", ("id", "CGJ-000001")]
