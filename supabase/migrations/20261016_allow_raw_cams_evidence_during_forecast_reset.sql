-- Keep the Forecast Reset write barrier for generated forecasts while allowing
-- raw CAMS provider evidence requested for ClearPath Production collection.
-- This is intentionally limited to two tables and one provider. No existing
-- forecast rows or source measurements are changed.
BEGIN;

CREATE OR REPLACE FUNCTION public.block_forecast_writes_during_reset()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_TABLE_SCHEMA = 'public'
     AND TG_TABLE_NAME IN ('forecast_provider_sync_runs', 'forecast_provider_snapshots')
     AND NEW.provider = 'openmeteo_cams' THEN
    IF TG_OP = 'INSERT' THEN
      RETURN NEW;
    ELSIF OLD.provider = 'openmeteo_cams' THEN
      RETURN NEW;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

COMMIT;
