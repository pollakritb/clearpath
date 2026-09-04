BEGIN;

ALTER TABLE forecast_provider_sync_runs
  DROP CONSTRAINT IF EXISTS forecast_provider_sync_runs_provider_check;
ALTER TABLE forecast_provider_sync_runs
  ADD CONSTRAINT forecast_provider_sync_runs_provider_check
  CHECK (provider IN ('gistda', 'openweather', 'openmeteo_cams'));

ALTER TABLE forecast_provider_snapshots
  DROP CONSTRAINT IF EXISTS forecast_provider_snapshots_provider_check;
ALTER TABLE forecast_provider_snapshots
  ADD CONSTRAINT forecast_provider_snapshots_provider_check
  CHECK (provider IN ('gistda', 'openweather', 'openmeteo_cams'));

COMMIT;
