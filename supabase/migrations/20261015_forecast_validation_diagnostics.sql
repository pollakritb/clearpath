-- Forward-only addition to the private, opt-in validation evidence schema.
-- Apply to ClearPath Staging only after 20261015_forecast_validation_evidence.sql.
create table if not exists public.forecast_validation_collection_runs (
    collection_slot timestamptz primary key,
    attempted_at timestamptz not null,
    station_count integer not null check (station_count >= 0),
    complete_station_count integer not null check (complete_station_count >= 0),
    snapshot_count integer not null check (snapshot_count >= 0),
    missing_by_station jsonb not null default '{}'::jsonb,
    station_issues jsonb not null default '{}'::jsonb,
    status text not null check (status in ('complete', 'partial', 'unavailable')),
    created_at timestamptz not null default now()
);
alter table public.forecast_validation_collection_runs enable row level security;
revoke all on public.forecast_validation_collection_runs from anon, authenticated;

-- Hourly observations remain empty until the official source and its timestamp
-- semantics are documented. This gate prevents accidental MAE on headline PM2.5.
alter table public.forecast_validation_hourly_observations
    add column if not exists window_start_at timestamptz,
    add column if not exists window_end_at timestamptz,
    add column if not exists timestamp_semantics_verified boolean not null default false;
