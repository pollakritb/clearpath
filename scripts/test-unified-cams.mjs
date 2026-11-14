// Local PGlite only. Exercises the actual numeric-ID migrations and RPC grants.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
const pg = new PGlite();
const migration = (suffix) =>
  readFileSync(
    "supabase/migrations/" +
      readdirSync("supabase/migrations").find((n) =>
        n.endsWith(suffix + ".sql"),
      ),
    "utf8",
  );
await pg.exec(
  readFileSync("backend/tests/fixtures/identifiers_baseline.sql", "utf8"),
);
await pg.exec(migration("identifier_rollout_control"));
await pg.exec(migration("readable_identifiers_expand"));
await pg.exec("update private.identifier_control set maintenance=true");
await pg.exec(migration("numeric_identifier_cutover"));
await pg.exec("begin");
await pg.exec(migration("private_identifier_aliases"));
await pg.exec("commit");
await pg.exec("update private.identifier_control set maintenance=false");
await pg.exec(
  "create table private.history_retention_state(singleton boolean primary key,last_completed_at timestamptz,result jsonb)",
);
await pg.exec(migration("retire_model_feature_storage"));
await pg.exec("begin");
await pg.exec(migration("unified_cams_grid_reads"));
await pg.exec("commit");
await pg.exec(
  "insert into cams_grid_definitions(id,latitudes,longitudes) values('test',array[13.6,14.0],array[100.0,100.4])",
);
const gen = async (age, state = "ready") =>
  (
    await pg.query(
      "insert into cams_grid_generations(grid_id,status,started_at,retrieved_at) values('test',$1,now()-$2::interval,now()-$2::interval) returning id",
      [state, age],
    )
  ).rows[0].id;
const current = await gen("1 hour");
const backup = await gen("80 hours");
const old = await gen("90 hours");
await pg.query("insert into cams_grid_active values(1,$1)", [current]);
await pg.query(
  "insert into cams_grid_frames(generation_id,valid_at,values) select $1,date_trunc('hour',now())+i*interval '1 hour',array[10.0,20.0,null,40.0] from generate_series(1,120) i",
  [current],
);
const point = (
  id,
  index,
  start = "now()",
  end = "now()+interval '121 hours'",
) =>
  pg.query(`select * from read_cams_grid_point($1,$2,${start},${end})`, [
    id,
    index,
  ]);
assert.equal((await point(current, 3)).rows.length, 120);
assert.equal((await point(current, 3)).rows[0].pm25, 40);
assert.equal((await point(current, 2)).rows[0].pm25, null);
assert.equal((await point(backup, 0)).rows.length, 0);
await assert.rejects(point(current, 4), /grid_point_index_invalid/);
await assert.rejects(point(current, -1), /grid_point_index_invalid/);
await assert.rejects(
  point(current, 0, "now()", "now()+interval '122 hours'"),
  /grid_point_range_invalid/,
);
await pg.exec("set role anon");
await assert.rejects(point(current, 0), /permission denied/);
await pg.exec("reset role; set role authenticated");
await assert.rejects(point(current, 0), /permission denied/);
await pg.exec("reset role;set role service_role");
assert.equal((await point(current, 3)).rows.length, 120);
await pg.exec("reset role");
await pg.query("select private.prune_recent_history(500)");
assert.deepEqual(
  (await pg.query("select id from cams_grid_generations order by id")).rows.map(
    (r) => r.id,
  ),
  [current, backup],
);
assert.equal(
  (
    await pg.query("select count(*) n from cams_grid_generations where id=$1", [
      old,
    ])
  ).rows[0].n,
  0,
);
console.log(
  "PASS: 120 scalar hours, nulls, bounds, RPC roles, expired data, protected active/backup, numeric migration chain",
);
await pg.close();
