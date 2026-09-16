# Forecast reset and maintenance state

## Current state

ClearPath forecasting is intentionally paused. Public forecast endpoints return
an explicit `unavailable` state with reason code
`forecast_system_under_improvement`; they do not calculate a fallback, read
provider snapshots, run an ML artifact, or persist a forecast ledger.

The map continues to show current Air4Thai and eligible community data. Forecast
horizon controls and provider comparison are hidden while the maintenance gate
is active. Air4Thai ingestion, community reports, moderation, trust, current
weather, satellite hotspots, and notifications remain operational.

The global server gate is `FORECAST_SYSTEM_PAUSED=true`. The temporary frontend
product gate is `FORECAST_SYSTEM_PAUSED` in `frontend/lib/forecast-state.ts`.
Both gates must remain active until a reviewed replacement is ready.

## Paused producers

- OpenWeather air-quality forecast provider sync
- Open-Meteo/CAMS forecast provider sync
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

## Next forecast (not implemented)

TODO: design and validate `clearpath-self-forecast-v1` as a separate change.
That work must define the baseline, time/season features, community evidence,
bias correction, uncertainty, backtest protocol, release gates, and monitoring
before either maintenance gate is disabled. Do not reuse the old forecast rows
as production output and do not enable XGBoost by default.
