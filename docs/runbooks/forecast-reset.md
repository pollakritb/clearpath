# Forecast reset and maintenance state

## Legacy storage retirement — 2026-10-30

The twelve unused Web Push/local-forecast tables are retired by
`supabase/migrations/20261029182957_retire_legacy_forecast_tables.sql`.
See [the retirement record](legacy-table-retirement-2026-10-30.md) for the exact
scope, backup and verification. Stored raw CAMS remains the public forecast.

The old producers below remain gated in the source for historical reference.
Their tables are no longer available after this migration: do not re-enable
them by changing a feature flag. A future self-forecast requires a new schema
and implementation. Paused-mode Admin endpoints return empty retired results;
the former false-safe review write endpoint returns HTTP 410.

## Current state

ClearPath serves raw PM2.5 forecasts from CAMS through Open-Meteo, stored by a
six-hour collector in Supabase. The public station endpoint reads the latest
completed snapshot for that station, up to 120 available future hourly values.
For an area, it uses a stored station forecast within 45 km and discloses the
source station and distance. No public forecast request calls Open-Meteo. If no
fresh snapshot exists, the API says unavailable without inventing values. The
system does not blend sources, calculate a local fallback, apply bias correction,
use community reports, run an ML artifact, or persist a forecast ledger.

The map continues to show current Air4Thai and community data. The Today page
and station detail show the stored CAMS timeline; the forecast map surface is
unavailable because no stored grid is collected. Air4Thai ingestion, community reports,
moderation, trust, current weather, satellite hotspots, and notifications remain
operational.

`EXTERNAL_FORECAST_ENABLED=true` enables this public external-only mode.
`FORECAST_SYSTEM_PAUSED=true` continues to protect every legacy/local producer,
evaluation job, and ML path. The frontend gate in
`frontend/lib/forecast-state.ts` is disabled so the raw provider values can be
shown.

An isolated CAMS snapshot collector is active in ClearPath
Production behind `CAMS_SNAPSHOT_COLLECTION_ENABLED=true`, an exact Supabase
project-ref guard, and a separately gated six-hour GitHub workflow. It populates
`forecast_provider_snapshots` without enabling the legacy provider-sync,
model, or evaluation pipeline. The collector requests five forecast days and
stores the continuous future hourly values actually supplied, at most 120 per
station. Its six-hour schedule is unchanged. See
`docs/forecast-field-validation.md` for activation and quota checks.

## Paused producers

- Legacy Open-Meteo/CAMS provider sync. Raw CAMS snapshots are a narrow exception
  after applying
  `20261016_allow_raw_cams_evidence_during_forecast_reset.sql` and
  `20261027_allow_cams_snapshot_retention.sql` and
  `20261027_prune_cams_history_rpc.sql`; no generated forecast or
  evaluation table is reopened.
- GISTDA forecast provider sync
- station and map-surface forecast generation
- forecast evaluation and drift snapshots
- legacy ML/XGBoost serving, shadow serving, training, and promotion
- weather forecast input collection inside the Air4Thai cron

The protected cron routes are retained and return `status: paused` so they can
be re-enabled deliberately later. The production scheduler continues to call
Air4Thai sync and alerts; a separate bounded job collects raw CAMS evidence only.

## Preserved data

Do not clear observations or identity/workflow records during a forecast reset.
This includes `stations`, `pm25_readings`, `weather_observations`,
`fire_feature_snapshots`, all community/report review/trust tables, `profiles`,
Air4Thai `sync_runs`, `forecast_data_quality_daily`, issue/audit logs,
notification preferences and connections. The empty legacy `model_registry`
and `forecast_release_decisions` tables are an explicit exception under the
2026-10-30 user-authorized retirement, with their schema backed up first.

## Next self forecast (not implemented)

TODO: design and validate `clearpath-self-forecast-v1` as a separate change.
That work must define the baseline, time/season features, community evidence,
bias correction, uncertainty, backtest protocol, release gates, and monitoring
before either maintenance gate is disabled. Do not reuse the old forecast rows
as production output and do not enable XGBoost by default.
