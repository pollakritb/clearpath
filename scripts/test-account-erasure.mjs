// Isolated PostgreSQL lifecycle rehearsal. Never connects to hosted data.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
process.on("uncaughtException", (error) => {
  console.error(error.message, error.where ?? "");
  process.exit(1);
});
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
await pg.exec(
  "insert into community_xp_control(singleton,enabled,maintenance) values(true,false,false)",
);
const owner = "00000000-0000-0000-0000-000000000001";
const other = "00000000-0000-0000-0000-000000000002";
for (const id of [owner, other]) {
  await pg.query("insert into auth.users values($1)", [id]);
  await pg.query(
    "insert into profiles(id,display_name) values($1,'Personal name')",
    [id],
  );
}
await pg.exec(migration("readable_identifiers_expand"));
await pg.exec("update private.identifier_control set maintenance=true");
await pg.exec(migration("numeric_identifier_cutover"));
await pg.exec("begin");
await pg.exec(migration("private_identifier_aliases"));
await pg.exec("commit");
await pg.exec("update private.identifier_control set maintenance=false");
await pg.exec(migration("registered_measurement_locations"));
await pg.exec(migration("community_identity_preferences"));
await pg.exec(migration("line_nearest_pin_notifications"));
await pg.exec(migration("account_erasure_lifecycle"));
await pg.exec(migration("account_erasure_identity_guard_fix"));
await pg.exec(migration("account_erasure_comment_scope"));
const ids = (await pg.query("select id,auth_user_id from profiles order by id"))
  .rows;
const uid = ids.find((r) => r.auth_user_id === owner).id;
const oid = ids.find((r) => r.auth_user_id === other).id;
await pg.query(
  "insert into community_xp_accounts(user_id,alias,hidden) values($1,'Personal alias',false)",
  [uid],
);
await pg.query(
  "insert into air_alert_locations(user_id,lat,lon,accuracy_m,observed_at,received_at) values($1,13.5,100,10,now(),now())",
  [uid],
);
const capture = (
  await pg.query(
    "insert into capture_sessions(user_id,issued_at,expires_at) values($1,now(),now()+interval '1 hour') returning id",
    [uid],
  )
).rows[0].id;
const report = (
  await pg.query(
    "insert into community_reports(user_id,display_name,anonymous_alias,lat,lon,public_lat,public_lon,capture_session_id,captured_at,status,pm25,audit_hold,image_path) values($1,'Personal name','Private alias',13.5,100,13.51,100.01,$2,now(),'approved',25,true,'retained/evidence.jpg') returning id",
    [uid, capture],
  )
).rows[0].id;
await pg.query(
  "insert into reputation_events(user_id,report_id,points,reason,idempotency_key) values($1,$2,10,'audit','closure-fixture')",
  [uid, report],
);
const job = (await pg.query("select request_account_erasure($1) value", [uid]))
  .rows[0].value;
assert.equal(job.status, "processing");
assert.equal(
  (await pg.query("select request_account_erasure($1) value", [uid])).rows[0]
    .value.id,
  job.id,
);
await assert.rejects(
  pg.query("select complete_account_erasure($1)", [job.id]),
  /auth_deletion_not_completed/,
);
await assert.rejects(
  pg.query(
    "insert into air_alert_locations(user_id,lat,lon,accuracy_m,observed_at,received_at) values($1,14,100,10,now(),now()) on conflict(user_id) do update set lat=14",
    [uid],
  ),
  /account_closed/,
);
await pg.query("delete from auth.users where id=$1", [owner]);
assert.equal(
  (await pg.query("select auth_user_id from profiles where id=$1", [uid]))
    .rows[0].auth_user_id,
  null,
);
const done = (
  await pg.query("select complete_account_erasure($1) value", [job.id])
).rows[0].value;
assert.equal(done.status, "completed");
assert.ok(done.completed_at);
assert.deepEqual(
  (await pg.query("select complete_account_erasure($1) value", [job.id]))
    .rows[0].value,
  done,
);
assert.equal(
  (
    await pg.query(
      "select count(*)::int n from air_alert_locations where user_id=$1",
      [uid],
    )
  ).rows[0].n,
  0,
);
assert.equal(
  (await pg.query("select count(*)::int n from profiles where id=$1", [oid]))
    .rows[0].n,
  1,
);
assert.equal(
  (
    await pg.query(
      "select hidden from community_xp_accounts where user_id=$1",
      [uid],
    )
  ).rows[0].hidden,
  true,
);
assert.equal(
  (
    await pg.query(
      "select count(*)::int n from private.identifier_aliases where legacy_id=$1",
      [owner],
    )
  ).rows[0].n,
  0,
);
assert.equal(
  (
    await pg.query(
      "select auth_user_id from private.account_erasure_jobs where request_id=$1",
      [job.id],
    )
  ).rows[0].auth_user_id,
  null,
);
const retained = (
  await pg.query(
    "select pm25,audit_hold,image_path,show_reporter_profile,anonymous_alias,display_name from community_reports where id=$1",
    [report],
  )
).rows[0];
assert.equal(retained.pm25, 25);
assert.equal(retained.audit_hold, true);
assert.equal(retained.image_path, "retained/evidence.jpg");
assert.equal(retained.show_reporter_profile, false);
assert.equal(retained.anonymous_alias, null);
assert.equal(retained.display_name, "บัญชีที่ลบแล้ว");
assert.equal(
  (
    await pg.query(
      "select sum(points)::int points from reputation_events where user_id=$1",
      [uid],
    )
  ).rows[0].points,
  10,
);
await pg.exec("set role authenticated");
await assert.rejects(
  pg.query("select pending_account_erasures()"),
  /permission denied/,
);
await assert.rejects(
  pg.query("select request_account_erasure($1)", [oid]),
  /permission denied/,
);
await assert.rejects(
  pg.query("select complete_account_erasure($1)", [job.id]),
  /permission denied/,
);
await pg.exec("reset role");
console.log(
  "Account erasure: owner-only, idempotency, Auth verification, stale-write rejection, tombstone, private cleanup, other-account isolation and RPC permissions passed",
);
await pg.close();
