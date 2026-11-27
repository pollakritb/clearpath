# Current forecast and retired pipeline

## Current behavior

Public station/area/map forecasts use the same stored raw CAMS / Open-Meteo
grid, up to 120 available future hours. The VPS collector checks six-hour slots,
checkpoints bounded batches and publishes a complete generation atomically. Public requests never fetch a provider
or run a local model. Missing/stale stored data returns unavailable, without
invented values. See [CAMS grid](cams-forecast-grid.md).

Air4Thai ingestion, satellite hotspots, community reports,
Trust, XP, measurement requests and notifications remain independent.

`EXTERNAL_FORECAST_ENABLED` controls stored station/area forecast reads.
`CAMS_GRID_COLLECTION_ENABLED` controls grid collection, with the exact
project-ref guard. The station-snapshot collector is a compatibility path and
returns `retired` when `CAMS_GRID_FORECAST_ENABLED=true`.
Collector configuration is documented in `.env.example` and the grid runbook.

## Retired compatibility boundaries

The former local/ML serving, shadow/canary/promotion, provider-selection,
prediction-ledger and evaluation pipelines were removed from source in the
local refactor of 2026-11-02. Their previous implementation remains in Git.
The old model tables were already retired by existing migrations; this refactor
does not alter tables, data, migrations, or deployment configuration.

- `/api/cron/forecast-evaluation` and `/api/cron/forecast-providers/*` always
  return the existing authenticated `status: paused` response without I/O.
- Air4Thai sync keeps `forecast_inputs` and `reconciliation` compatibility
  fields as paused responses, while official ingestion and evidence retention run.
- Retired Admin forecast collections return empty `status: retired` responses.
- `/api/forecast/surface` keeps its bounded validation and unavailable contract.
  Stored map grids are read through `/api/forecast-grid/*` instead.
- `FORECAST_SYSTEM_PAUSED` is accepted only for settings compatibility and
  cannot reactivate a retired producer, even when set to false.

There is no XGBoost runtime/training dependency or dormant ML workflow.
Do not run historical training/promotion instructions against the current schema.

## Preserved evidence

Keep observations, stored CAMS, report evidence, account/workflow/notification
records, identifier aliases and migration history. Read-only Admin access to
historical issue/audit logs remains available. CAMS/OCR/IDW offline field-evaluation
tools live in the external archive, separate from the deployed codebase.

The 2026-10-30 storage retirement record remains available in
legacy table retirement ([ประวัติ](../cleanup.md#archive-และการคืนงาน)).
Future ClearPath self-forecast work needs a new reviewed specification, schema,
backtest protocol and release policy; toggling an old environment flag is insufficient.
