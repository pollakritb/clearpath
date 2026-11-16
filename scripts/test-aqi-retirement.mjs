import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const pg = new PGlite();
await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema review;
create table public.stations(id text primary key,pm25 float8,aqi int,recorded_at timestamptz,updated_at timestamptz);
create table public.pm25_readings(id bigint primary key,code text,station_id text references public.stations(id),pm25 float8,aqi int,recorded_at timestamptz,created_at timestamptz,source_at timestamptz,ingested_at timestamptz,source_status text);
alter table stations enable row level security; alter table pm25_readings enable row level security;
grant usage on schema review to service_role;
grant select on stations,pm25_readings to service_role;
create view review.stations with(security_invoker=true) as select id as station_id,pm25,aqi,recorded_at,updated_at from stations;
create view review.pm25_readings with(security_invoker=true) as select code,station_id,pm25,aqi,recorded_at,created_at,source_status from pm25_readings;
insert into stations values('02t',22,42,'2026-11-17T10:00:00+07','2026-11-17T10:05:00+07');
insert into pm25_readings values(1,'OBS-000001','02t',22,42,'2026-11-17T10:00:00+07','2026-11-17T10:05:00+07','2026-11-17T10:00:00+07','2026-11-17T10:05:00+07','observed');`);
const migration = readFileSync(
  new URL(
    "../supabase/migrations/20261116185601_remove_unused_aqi.sql",
    import.meta.url,
  ),
  "utf8",
);
// An unexpected dependent view must abort without deleting either AQI column.
await pg.exec(
  "create view public.unexpected_aqi_dependency as select aqi from stations",
);
await assert.rejects(pg.exec(migration));
await pg.exec("rollback");
assert.equal(
  (
    await pg.query(
      "select count(*)::int n from information_schema.columns where table_schema='public' and table_name in ('stations','pm25_readings') and column_name='aqi'",
    )
  ).rows[0].n,
  2,
);
await pg.exec("drop view public.unexpected_aqi_dependency");
await pg.exec(migration);
assert.equal(
  (
    await pg.query(
      "select count(*)::int n from information_schema.columns where table_schema in ('public','review') and column_name='aqi'",
    )
  ).rows[0].n,
  0,
);
assert.deepEqual(
  (
    await pg.query(
      "select id,pm25,extract(epoch from recorded_at)::int as epoch from pm25_readings",
    )
  ).rows,
  [{ id: 1, pm25: 22, epoch: 1794884400 }],
);
assert.equal(
  (
    await pg.query(
      "select to_char(recorded_at_bangkok,'YYYY-MM-DD HH24:MI') as local from review.pm25_readings",
    )
  ).rows[0].local,
  "2026-11-17 10:00",
);
await pg.exec(
  "insert into stations(id,pm25,recorded_at) values ('03t',15,'2026-11-17T11:00:00+07')",
);
await pg.exec("set role service_role");
assert.equal(
  (await pg.query("select count(*)::int n from review.stations")).rows[0].n,
  2,
);
await assert.rejects(pg.exec("update review.stations set pm25=900"));
await pg.exec("reset role; set role anon");
await assert.rejects(pg.query("select * from review.pm25_readings"));
await pg.exec("reset role");
await pg.close();
console.log(
  "AQI retirement: atomic rollback, data/FK preservation, Bangkok time, future inserts and permissions passed",
);
