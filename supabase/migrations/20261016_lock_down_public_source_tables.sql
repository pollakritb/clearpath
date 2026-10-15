-- Public data is served through the ClearPath API. The browser uses Supabase
-- only for Auth; it must not read or mutate these source and operational tables
-- through PostgREST. Keep service_role access for the backend and cron jobs.
BEGIN;

GRANT ALL PRIVILEGES ON TABLE
  public.activities,
  public.alert_events,
  public.announcements,
  public.fire_feature_snapshots,
  public.pm25_readings,
  public.rate_limit_windows,
  public.stations,
  public.sync_runs,
  public.weather_forecasts,
  public.weather_observations
TO service_role;

REVOKE ALL PRIVILEGES ON TABLE
  public.activities,
  public.alert_events,
  public.announcements,
  public.fire_feature_snapshots,
  public.pm25_readings,
  public.rate_limit_windows,
  public.stations,
  public.sync_runs,
  public.weather_forecasts,
  public.weather_observations
FROM PUBLIC, anon, authenticated;

ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fire_feature_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm25_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_forecasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weather_observations ENABLE ROW LEVEL SECURITY;

COMMIT;
