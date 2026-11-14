// Isolated PostgreSQL only: never connects to Supabase or LINE.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
const pg = new PGlite();
const migration = (suffix) =>
  readFileSync(
    "supabase/migrations/" +
      readdirSync("supabase/migrations").find((x) =>
        x.endsWith(suffix + ".sql"),
      ),
    "utf8",
  );
await pg.exec(
  readFileSync("backend/tests/fixtures/identifiers_baseline.sql", "utf8"),
);
await pg.exec(migration("identifier_rollout_control"));
await pg.exec(
  "insert into community_xp_control(singleton,enabled,maintenance) values(true,false,false)",
);
for (const n of [1, 2]) {
  const id = "00000000-0000-0000-0000-" + String(n).padStart(12, "0");
  await pg.query("insert into auth.users values($1)", [id]);
  await pg.query("insert into profiles(id) values($1)", [id]);
}
await pg.exec(migration("readable_identifiers_expand"));
await pg.exec("update private.identifier_control set maintenance=true");
await pg.exec(migration("numeric_identifier_cutover"));
await pg.exec("update private.identifier_control set maintenance=false");
await pg.exec(migration("line_nearest_pin_notifications"));
await pg.exec("begin");
await pg.exec(migration("exclude_self_air_alerts"));
await pg.exec("commit");
for (const n of [1, 2]) {
  await pg.query(
    "insert into capture_sessions(user_id,issued_at,expires_at) values($1,now(),now()+interval '5 minutes')",
    [n],
  );
  await pg.query(
    "insert into community_reports(user_id,capture_session_id,lat,lon,public_lat,public_lon,pm25,status,captured_at) values($1,$1,14,100,$2,100,$3,'approved',now())",
    [n, n === 1 ? 14.0001 : 14.002, n === 1 ? 38 : 55],
  );
}
const pick = async (user) =>
  (
    await pg.query(
      "select air_alert_candidates_for_user($1,14::float8,100::float8,10::float8) result",
      [user],
    )
  ).rows[0].result;
const owner = await pick(1);
assert.equal(owner.length, 1);
assert.equal(owner[0].pm25, 55, "own nearer 38 must not mask another user 55");
assert.equal((await pick(2))[0].pm25, 38, "ownership depends on recipient");
assert.deepEqual(await pick(null), [], "unknown recipient must fail closed");
const last = (await pg.query("select now() t")).rows[0].t;
const n = (
  await pg.query(
    "insert into user_notifications(user_id,event_type,title,body,url,payload,deduplication_key,created_at) values(1,'air_alert','test','test','/',jsonb_build_object('source_type','community','source_id','1'),'fixture', $1) returning id",
    [last],
  )
).rows[0].id;
await pg.query(
  "insert into notification_outbox(user_id,notification_id,event_key,payload,status,processed_at) values(1,$1,'fixture', '{}'::jsonb,'sent',$2)",
  [n, last],
);
const proof = async (at) =>
  (await pg.query("select air_alert_previous_was_own(1,$1) result", [at]))
    .rows[0].result;
assert.equal(await proof(last), true);
assert.equal(
  await proof(new Date(new Date(last).getTime() + 60_000)),
  false,
  "unrelated episode timestamp must not reset",
);
await pg.query(
  "update user_notifications set payload=jsonb_build_object('source_type','community','source_id','2') where id=$1",
  [n],
);
assert.equal(
  await proof(last),
  false,
  "valid other-user warning must be preserved",
);
await pg.exec("set role anon");
await assert.rejects(pick(1), /permission denied/);
await pg.exec("reset role;set role authenticated");
await assert.rejects(pick(1), /permission denied/);
await pg.exec("reset role;set role service_role");
assert.equal((await pick(1))[0].pm25, 55);
await pg.close();
console.log(
  "PASS: owner exclusion before nearest LIMIT, recipient scope, null safety, evidence-bound episode repair and RPC permissions",
);
