-- Isolated field-test evidence. This migration is NOT applied by the app.
-- No public reads and no changes to existing forecast/source tables.
create table if not exists public.forecast_validation_snapshots (
    station_id text not null references public.stations(id),
    collection_slot timestamptz not null,
    fetched_at timestamptz not null,
    valid_at timestamptz not null,
    pm25 double precision not null check (pm25 >= 0),
    requested_lat double precision not null,
    requested_lon double precision not null,
    grid_lat double precision,
    grid_lon double precision,
    provider text not null check (provider = 'openmeteo_cams_global'),
    observation_period_minutes integer,
    created_at timestamptz not null default now(),
    primary key (station_id, collection_slot, valid_at),
    check (fetched_at < valid_at)
);

create index if not exists forecast_validation_snapshots_valid_at_idx
    on public.forecast_validation_snapshots (valid_at);

alter table public.forecast_validation_snapshots enable row level security;
revoke all on public.forecast_validation_snapshots from anon, authenticated;

-- Reserved for a verified official one-hour observation adapter. The current
-- Air4Thai headline/pm25_readings value must not be copied into this table.
create table if not exists public.forecast_validation_hourly_observations (
    station_id text not null references public.stations(id),
    valid_at timestamptz not null,
    pm25 double precision not null check (pm25 >= 0),
    average_period_minutes integer not null check (average_period_minutes = 60),
    source text not null check (source = 'air4thai_official_hourly'),
    fetched_at timestamptz not null,
    created_at timestamptz not null default now(),
    primary key (station_id, valid_at)
);

alter table public.forecast_validation_hourly_observations enable row level security;
revoke all on public.forecast_validation_hourly_observations from anon, authenticated;
