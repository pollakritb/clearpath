import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const pg = new PGlite();
await pg.exec(`create schema cron;
create table cron.job(jobid bigint primary key,jobname text,schedule text,command text,active boolean);
create function cron.alter_job(bigint,schedule text) returns void language sql as
'update cron.job set schedule=$2 where jobid=$1';
insert into cron.job values(2,'clearpath-air4thai-sync-30m','17,47 * * * *','select safe_vault_command(''/api/cron/sync'')',true);`);
const sql = readFileSync(
  new URL(
    "../supabase/migrations/20261110002811_air4thai_continuity_5m.sql",
    import.meta.url,
  ),
  "utf8",
);
await pg.exec(sql);
await pg.exec(sql); // Retry must not add a second job or replace its command.
const rows = (await pg.query("select * from cron.job")).rows;
assert.equal(rows.length, 1);
assert.equal(rows[0].schedule, "2-57/5 * * * *");
assert.equal(rows[0].active, true);
assert.equal(rows[0].command, "select safe_vault_command('/api/cron/sync')");
await pg.exec("update cron.job set schedule='unexpected'");
await assert.rejects(pg.exec(sql), /schedule is unexpected/);
await pg.exec("rollback");
assert.equal(
  (await pg.query("select schedule from cron.job")).rows[0].schedule,
  "unexpected",
);
await pg.close();
console.log(
  "Air4Thai schedule: cadence, command preservation, retry, drift guard passed",
);
