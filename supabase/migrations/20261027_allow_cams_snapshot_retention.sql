-- Keep the forecast reset barrier while allowing expired raw CAMS evidence
-- to be removed. The prior function referenced NEW during DELETE and therefore
-- could not reliably prune old provider snapshots or their sync runs.
begin;

create or replace function public.block_forecast_writes_during_reset()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if tg_table_schema = 'public'
       and tg_table_name in ('forecast_provider_sync_runs', 'forecast_provider_snapshots')
       and old.provider = 'openmeteo_cams' then
      return old;
    end if;
    return null;
  end if;

  if tg_table_schema = 'public'
     and tg_table_name in ('forecast_provider_sync_runs', 'forecast_provider_snapshots')
     and new.provider = 'openmeteo_cams' then
    if tg_op = 'INSERT' then
      return new;
    elsif tg_op = 'UPDATE' and old.provider = 'openmeteo_cams' then
      return new;
    end if;
  end if;
  return null;
end;
$$;

create index if not exists idx_cams_snapshot_station_issue_forecast
  on public.forecast_provider_snapshots(station_id, issued_at desc, forecast_at)
  where provider = 'openmeteo_cams';

commit;
