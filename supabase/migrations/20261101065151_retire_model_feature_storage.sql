-- Retire only the unused persisted model-input/quality tables.
-- Public satellite hotspots still use the independent FIRMS adapter.
set local lock_timeout='5s';
set local statement_timeout='30s';
lock table public.weather_observations,public.fire_feature_snapshots,public.forecast_data_quality_daily in access exclusive mode;
do $$ begin
 if exists(select 1 from public.weather_observations) or exists(select 1 from public.fire_feature_snapshots)
 or exists(select 1 from public.forecast_data_quality_daily) then
  raise exception 'retired_feature_tables_must_be_empty'; end if;
end $$;
create or replace function private.prune_recent_history(p_limit integer default 1000)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  r record;
  cutoff timestamptz := now()-interval '72 hours';
  batch_size integer := greatest(1,least(coalesce(p_limit,1000),1000));
  removed integer;
  result jsonb := '{}'::jsonb;
begin
  if exists(select 1 from private.identifier_control where maintenance) then
    return jsonb_build_object('skipped','identifier_maintenance');
  end if;
  if not pg_try_advisory_xact_lock(hashtext('clearpath_recent_history')) then
    return jsonb_build_object('skipped','already_running');
  end if;
  -- Tables/columns are a static allowlist; no caller-supplied SQL identifiers.
  for r in select * from (values
    ('pm25_readings','recorded_at'),
    ('forecast_provider_snapshots','issued_at'),
    ('sync_runs','started_at'),
    ('rate_limit_windows','window_started_at')
  ) as targets(table_name,time_column) loop
    execute format('delete from public.%I where ctid in
      (select ctid from public.%I where %I < $1
       order by %I limit $2 for update skip locked)',
      r.table_name,r.table_name,r.time_column,r.time_column)
      using cutoff,batch_size;
    get diagnostics removed=row_count;
    result:=result||jsonb_build_object(r.table_name,removed);
  end loop;
  delete from public.forecast_provider_sync_runs where id in (
    select sr.id from public.forecast_provider_sync_runs sr
    where sr.started_at<cutoff and not exists
      (select 1 from public.forecast_provider_snapshots s where s.sync_run_id=sr.id)
    order by sr.started_at limit batch_size for update skip locked
  );
  get diagnostics removed=row_count;
  result:=result||jsonb_build_object('forecast_provider_sync_runs',removed);
  delete from public.cams_grid_jobs where id in (
    select j.id from public.cams_grid_jobs j where j.created_at<cutoff
    and not exists(select 1 from public.cams_grid_active a where a.generation_id=j.generation_id)
    order by j.created_at limit least(batch_size,10) for update skip locked
  );
  delete from public.cams_grid_generations where id in (
    select g.id from public.cams_grid_generations g where g.started_at<cutoff
    and not exists(select 1 from public.cams_grid_active a where a.generation_id=g.id)
    and not exists(select 1 from public.cams_grid_jobs j where j.generation_id=g.id)
    order by g.started_at limit 1 for update skip locked
  );
  -- Retired telemetry aliases must not grow forever. Community aliases stay
  -- intact because historical links and idempotent retries depend on them.
  for r in select unnest(array['sync_runs','forecast_provider_sync_runs',
    'forecast_provider_snapshots','cams_grid_generations','cams_grid_jobs']) as table_name loop
    execute format('delete from private.identifier_aliases where (entity,legacy_id) in
      (select a.entity,a.legacy_id from private.identifier_aliases a
       where a.entity=$1 and not exists(select 1 from public.%I t where t.id=a.numeric_id)
       limit $2)',r.table_name) using r.table_name,batch_size;
  end loop;
  if to_regclass('cron.job_run_details') is not null then
    execute 'delete from cron.job_run_details where ctid in
      (select ctid from cron.job_run_details where end_time<$1 limit $2)'
      using cutoff,batch_size;
  end if;
  insert into private.history_retention_state(singleton,last_completed_at,result)
  values(true,now(),result) on conflict(singleton) do update
    set last_completed_at=excluded.last_completed_at,result=excluded.result;
  return result;
end $$;
revoke all on function private.prune_recent_history(integer) from public,anon,authenticated,service_role;

drop view review.weather_observations;
drop view review.fire_feature_snapshots;
drop view review.forecast_data_quality_daily;
-- Deliberately no CASCADE: an unexpected dependency aborts the transaction.
drop table public.weather_observations;
drop table public.fire_feature_snapshots;
drop table public.forecast_data_quality_daily;
notify pgrst,'reload schema';
