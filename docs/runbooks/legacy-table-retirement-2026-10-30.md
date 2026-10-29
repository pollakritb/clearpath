# Legacy table retirement — 2026-10-30 (Asia/Bangkok)

Project: ClearPath Production (`qnrtryspglioqhdxglzu`). The user explicitly
requested dropping the twelve legacy tables identified in the database review.

## Scope

- `push_subscriptions`
- `forecast_consensus_latest`
- `forecast_prediction_sources`
- `community_forecast_feature_snapshots`
- `forecast_runs`
- `forecast_predictions`
- `forecast_evaluation_daily`
- `forecast_drift_snapshots`
- `forecast_false_safe_reviews`
- `model_registry`
- `forecast_release_decisions`
- `weather_forecasts`

The matching `promote_forecast_model`, `rollback_forecast_model` and
`transition_forecast_model` functions are removed explicitly. The shared
`block_forecast_writes_during_reset` function remains because retained raw CAMS
tables still use it. No `CASCADE` is used.

## Backup and guard

Live preflight found all twelve tables empty, with no incoming foreign keys
from retained tables. Active database jobs were Air4Thai sync and measurement
requests. The database had 45 public tables; staging validation tables were
not present in this production project.

A private targeted schema/data export, including constraints, indexes, grants,
RLS, triggers, relevant functions and migration history, was saved outside Git:

`/private/tmp/clearpath-legacy-backup-20261030/`

- `backup.json` SHA-256:
  `83bee924a5cc179526c947d817f717e09460766f7ef0b307013b6a28b89cdf7c`
- `restore.sql`: generated from live schema metadata.
- `rehearsal.json`: isolated PostgreSQL restore/drop/restore verification.

This is a targeted backup of twelve empty tables, not a whole-project backup.
No Storage objects are deleted. Backup files are temporary local artifacts and
must be moved to durable private storage if long-term retention is required.

Migration: `20261029182957_retire_legacy_forecast_tables.sql`.

Migration SHA-256:
`f0138173e73ef6014d13cf3484de993c6d72a4b407bfede2ae21035ac283ac8d`

The migration takes bounded locks and rechecks that every target remains empty
inside the transaction. Any new row or unexpected dependency aborts the drop.
It preserves all current Air4Thai/CAMS/community/identity/notification storage
and `forecast_data_quality_daily`, `weather_observations`, and
`fire_feature_snapshots`.

## Application compatibility

The compatibility deployment uses production commit
`11f7042dac31156d15e9cc9a5776056086f94e74` plus only these changes:

- paused-mode Admin legacy reads return empty `status: retired` results;
- the paused legacy false-safe review write returns HTTP 410;
- provider health does not query the removed consensus table in paused mode;
- production preflight no longer requires the removed tables.

The initial compatibility deployment was superseded by a concurrent frontend
release. Compatibility was rebuilt on the newer production commit above,
retaining that release. Other uncommitted workspace files are not included.
Legacy producers remain gated; they cannot be re-enabled against the retired
schema without a new implementation and migrations.

## Validation

- Restore of the live targeted backup passed in PGlite, including schema,
  constraints, indexes, permissions and triggers.
- A nonempty target aborted the migration atomically in the rehearsal.
- Exactly the twelve target tables were removed in the rehearsal; retained
  table data remained present; restore after drop passed.
- Ruff format/check passed for backend, api and scripts.
- Relevant application tests: 49 passed.
- Broader Python suite: 446 passed after excluding
  `backend/tests/test_forecast_training_script.py`, whose collection fails in
  this environment because the old XGBoost dependency cannot load
  `libomp.dylib`. The full suite could not complete without that exclusion.

## Production result

Applied successfully to ClearPath Production. Migration history contains
`20261029182957` / `retire_legacy_forecast_tables`.

- Public tables: **45 → 33**; exactly the twelve listed tables were removed.
- Every retained table remained present.
- Production dependency dry-run passed and was rolled back before application.
- Compatibility deployment: `dpl_NKUte98rhvBHBYWK31ezjKmAUxLa`, based on
  production commit `11f7042dac31156d15e9cc9a5776056086f94e74`.
- Post-drop HTTP checks all returned 200: `/api/ready`,
  `/api/forecast?station_id=103t&hours=24`, `/api/community/reports`, and
  `/api/pm25/current`.
- Detailed local evidence: `verification.json`, `postdrop-database.json` and
  `apply-result.json` in the private backup directory above.

The three staging validation tables were never in this production database;
33 is the production table count after retirement, while the earlier 48-table
review also included those three staging-only tables.

Final database verification: 177 stations, 255205 Air4Thai readings,
190629 CAMS snapshots, 17 community reports, and
29028 data-quality rows remained present. Both production cron jobs
remained active; the report-images bucket remained private; all three retired
model RPCs were absent.
