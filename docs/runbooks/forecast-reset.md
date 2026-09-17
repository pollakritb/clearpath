# Forecast reset and maintenance state

## Current state

ClearPath now serves raw PM2.5 forecasts from CAMS through Open-Meteo for the
1, 3, 6, 12, and 24-hour product horizons. The public endpoints request the
provider on demand and do not blend sources, calculate a local fallback, apply
bias correction, use community reports, run an ML artifact, or persist a
forecast ledger/provider snapshot.

The map continues to show current Air4Thai and eligible community data. Forecast
horizon controls show the raw CAMS surface; provider comparison is omitted
because only one provider is active. Air4Thai ingestion, community reports,
moderation, trust, current weather, satellite hotspots, and notifications remain
operational.

`EXTERNAL_FORECAST_ENABLED=true` enables this public external-only mode.
`FORECAST_SYSTEM_PAUSED=true` continues to protect every legacy/local producer,
evaluation job, and ML path. The frontend gate in
`frontend/lib/forecast-state.ts` is disabled so the raw provider values can be
shown.

## Paused producers

- OpenWeather air-quality forecast provider sync
- Open-Meteo/CAMS forecast provider sync and database snapshots (public reads
  call the provider directly instead)
- GISTDA forecast provider sync
- station and map-surface forecast generation
- forecast evaluation and drift snapshots
- legacy ML/XGBoost serving, shadow serving, training, and promotion
- weather forecast input collection inside the Air4Thai cron

The protected cron routes are retained and return `status: paused` so they can
be re-enabled deliberately later. The production scheduler continues to call
only Air4Thai sync and alerts.

## Preserved data

Do not clear observations or identity/workflow records during a forecast reset.
This includes `stations`, `pm25_readings`, `weather_observations`,
`fire_feature_snapshots`, all community/report review/trust tables, `profiles`,
Air4Thai `sync_runs`, `forecast_data_quality_daily`, issue/audit logs,
notification preferences and connections, `model_registry`, and
`forecast_release_decisions`.

## Next self forecast (not implemented)

TODO: design and validate `clearpath-self-forecast-v1` as a separate change.
That work must define the baseline, time/season features, community evidence,
bias correction, uncertainty, backtest protocol, release gates, and monitoring
before either maintenance gate is disabled. Do not reuse the old forecast rows
as production output and do not enable XGBoost by default.
