-- Additive only. No data backfill, collection, table drop or production activation.
set local lock_timeout='5s';
set local statement_timeout='30s';
create function public.read_cams_grid_point(
 p_generation bigint, p_index integer, p_start timestamptz, p_end timestamptz
) returns table(forecast_at timestamptz, pm25 double precision)
language plpgsql stable security invoker set search_path='' as $$
declare cell_count integer;
begin
 if p_generation is null or p_index is null or p_start is null or p_end is null
    or p_start>=p_end or p_end-p_start>interval '121 hours' then
   raise exception 'grid_point_range_invalid';
 end if;
 select cardinality(d.latitudes)*cardinality(d.longitudes) into cell_count
 from public.cams_grid_generations g join public.cams_grid_definitions d on d.id=g.grid_id
 where g.id=p_generation and g.status='ready'
   and g.retrieved_at<=now() and g.retrieved_at>now()-interval '36 hours';
 if cell_count is null then return; end if;
 if p_index<0 or p_index>=cell_count then raise exception 'grid_point_index_invalid'; end if;
 return query select f.valid_at, f.values[p_index+1]
 from public.cams_grid_frames f where f.generation_id=p_generation
   and f.valid_at>p_start and f.valid_at<=p_end order by f.valid_at limit 120;
end $$;
revoke all on function public.read_cams_grid_point(bigint,integer,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.read_cams_grid_point(bigint,integer,timestamptz,timestamptz) to service_role;

CREATE OR REPLACE FUNCTION public.publish_cams_grid(p_job bigint, p_token uuid, p_frames jsonb, p_fingerprint text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE j cams_grid_jobs; grid cams_grid_definitions; f jsonb; vals float8[]; ats timestamptz[]='{}'; previous_id bigint; gid bigint; last_at timestamptz;
BEGIN
 SELECT * INTO j FROM cams_grid_jobs WHERE id=p_job FOR UPDATE;
 IF j.status<>'running' OR j.lease_token IS DISTINCT FROM p_token OR j.lease_until<=now() OR j.created_at<now()-interval '20 minutes' OR j.next_batch<>j.batch_count
 OR (SELECT count(*) FROM cams_grid_chunks WHERE job_id=p_job)<>j.batch_count THEN RAISE EXCEPTION 'grid_incomplete_or_lease_lost'; END IF;
 IF jsonb_array_length(p_frames) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'grid_frame_count_invalid'; END IF;
 SELECT d.* INTO grid FROM cams_grid_definitions d JOIN cams_grid_generations g ON g.grid_id=d.id WHERE g.id=j.generation_id;
 IF grid.id IS NULL THEN RAISE EXCEPTION 'grid_definition_missing'; END IF;
 FOR f IN SELECT * FROM jsonb_array_elements(p_frames) LOOP
   vals=ARRAY(SELECT CASE WHEN v='null'::jsonb THEN NULL ELSE v::text::float8 END FROM jsonb_array_elements(f->'values') v);
   IF cardinality(vals)<>cardinality(grid.latitudes)*cardinality(grid.longitudes)
      OR EXISTS(SELECT 1 FROM unnest(vals) v WHERE v IS NOT NULL AND NOT(v>=0 AND v<=2000)) THEN RAISE EXCEPTION 'grid_frame_shape_invalid'; END IF;
   IF (f->>'valid_at')::timestamptz IS NULL OR (last_at IS NOT NULL AND (f->>'valid_at')::timestamptz<=last_at) THEN RAISE EXCEPTION 'grid_time_invalid'; END IF;
   last_at=(f->>'valid_at')::timestamptz;
   ats=array_append(ats,last_at);
   INSERT INTO cams_grid_frames(generation_id,valid_at,values) VALUES(j.generation_id,last_at,vals);
 END LOOP;
 IF last_at<=now() THEN RAISE EXCEPTION 'grid_forecast_expired'; END IF;
 SELECT a.generation_id INTO previous_id FROM cams_grid_active a WHERE a.id=1;
 gid=j.generation_id;
 IF EXISTS(SELECT 1 FROM cams_grid_generations WHERE id=previous_id AND fingerprint=p_fingerprint AND grid_id=grid.id) THEN
   -- Keep original retrieval time when payload is unchanged; do not pretend it is newer.
   gid=previous_id;
   UPDATE cams_grid_jobs SET generation_id=gid WHERE id=p_job;
   DELETE FROM cams_grid_generations WHERE id=j.generation_id;
 ELSE
   UPDATE cams_grid_generations SET status='ready',retrieved_at=now(),valid_times=ats,fingerprint=p_fingerprint WHERE id=gid;
   INSERT INTO cams_grid_active(id,generation_id) VALUES(1,gid) ON CONFLICT(id) DO UPDATE SET generation_id=excluded.generation_id;
 END IF;
 UPDATE cams_grid_jobs SET status='ready',completed_at=now(),lease_until=NULL,lease_token=NULL WHERE id=p_job;
 DELETE FROM cams_grid_chunks WHERE job_id=p_job;
 -- Cleanup runs in the bounded retention job, never the publish transaction.
 RETURN jsonb_build_object('status','ready','generation_id',gid,'frame_count',cardinality(ats));
END $function$
;
revoke all on function public.publish_cams_grid(p_job bigint, p_token uuid, p_frames jsonb, p_fingerprint text) from public,anon,authenticated;
grant execute on function public.publish_cams_grid(p_job bigint, p_token uuid, p_frames jsonb, p_fingerprint text) to service_role;

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
    and (j.lease_until is null or j.lease_until<now())
    and not exists(select 1 from public.cams_grid_active a where a.generation_id=j.generation_id)
    and not exists(select 1 from (select id from public.cams_grid_generations where status='ready' order by retrieved_at desc,id desc limit 2) keep where keep.id=j.generation_id)
    order by j.created_at limit least(batch_size,10) for update skip locked
  );
  delete from public.cams_grid_generations where id in (
    select g.id from public.cams_grid_generations g where g.started_at<cutoff
    and not exists(select 1 from public.cams_grid_active a where a.generation_id=g.id)
    and not exists(select 1 from (select id from public.cams_grid_generations where status='ready' order by retrieved_at desc,id desc limit 2) keep where keep.id=g.id)
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

notify pgrst,'reload schema';
