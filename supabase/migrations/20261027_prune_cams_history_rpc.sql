-- Delete expired CAMS evidence inside Postgres so retention never sends a
-- thousand UUIDs in one PostgREST URL. This function uses caller privileges.
begin;

create or replace function public.prune_expired_cams_history(
  p_snapshot_cutoff timestamptz,
  p_run_cutoff timestamptz,
  p_batch_size integer default 1000
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_batch_size integer := least(greatest(coalesce(p_batch_size, 1000), 1), 1000);
  v_snapshots integer;
  v_runs integer;
begin
  with doomed as (
    select id
    from public.forecast_provider_snapshots
    where provider = 'openmeteo_cams' and issued_at < p_snapshot_cutoff
    order by issued_at
    limit v_batch_size
    for update skip locked
  )
  delete from public.forecast_provider_snapshots as snapshots
  using doomed
  where snapshots.id = doomed.id;
  get diagnostics v_snapshots = row_count;

  with doomed as (
    select id
    from public.forecast_provider_sync_runs
    where provider = 'openmeteo_cams' and completed_at < p_run_cutoff
    order by completed_at
    limit v_batch_size
    for update skip locked
  )
  delete from public.forecast_provider_sync_runs as runs
  using doomed
  where runs.id = doomed.id;
  get diagnostics v_runs = row_count;

  return jsonb_build_object('deleted_snapshots', v_snapshots, 'deleted_runs', v_runs);
end;
$$;

revoke all on function public.prune_expired_cams_history(timestamptz, timestamptz, integer)
  from public, anon, authenticated;
grant execute on function public.prune_expired_cams_history(timestamptz, timestamptz, integer)
  to service_role;

commit;
