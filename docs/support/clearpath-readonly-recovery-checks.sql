-- Run only after the existing project accepts SQL connections again.
-- Read-only diagnostics: no data changes, no billing actions, no reset.
begin read only;

select public.identifier_schema_state() as identifier_state;

select version, name
from supabase_migrations.schema_migrations
where version in (
  '20261101002656', '20261101005119', '20261101005121'
)
order by version;

select table_name, column_name, data_type, is_identity
from information_schema.columns
where table_schema = 'public'
  and table_name in ('profiles', 'community_reports', 'forecast_provider_snapshots')
  and column_name in ('id', 'legacy_id', 'numeric_id', 'auth_user_id', 'code')
order by table_name, ordinal_position;

select jobid, jobname, schedule, active
from cron.job
where jobname like 'clearpath-%'
order by jobid;

select pg_size_pretty(pg_database_size(current_database())) as application_database_size;

select slot_name, slot_type, active,
       pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) as retained_wal
from pg_replication_slots;

commit;
