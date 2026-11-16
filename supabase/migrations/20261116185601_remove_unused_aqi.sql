-- Deploy the compatible application before applying this migration.
-- Metadata-only removal: no UPDATE/backfill, table copy, CASCADE or table rewrite.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '10s';

drop view review.pm25_readings;
drop view review.stations;
alter table public.pm25_readings drop column aqi restrict;
alter table public.stations drop column aqi restrict;

create view review.pm25_readings with (security_invoker = true) as
select t.code, t.station_id, t.pm25, t.recorded_at, t.created_at, t.source_status,
       t.recorded_at at time zone 'Asia/Bangkok' as recorded_at_bangkok,
       t.created_at at time zone 'Asia/Bangkok' as created_at_bangkok,
       t.source_at at time zone 'Asia/Bangkok' as source_at_bangkok,
       t.ingested_at at time zone 'Asia/Bangkok' as ingested_at_bangkok
from public.pm25_readings t;
create view review.stations with (security_invoker = true) as
select t.id as station_id, t.pm25, t.recorded_at, t.updated_at,
       t.recorded_at at time zone 'Asia/Bangkok' as recorded_at_bangkok,
       t.updated_at at time zone 'Asia/Bangkok' as updated_at_bangkok
from public.stations t;
revoke all on review.pm25_readings, review.stations from public, anon, authenticated;
grant select on review.pm25_readings, review.stations to service_role;
comment on view review.pm25_readings is
  'Read-only inspection. *_bangkok columns show Thailand local time; source instants remain timestamptz. No copied data.';
comment on view review.stations is
  'Read-only inspection. *_bangkok columns show Thailand local time; source instants remain timestamptz. No copied data.';
notify pgrst, 'reload schema';
commit;
