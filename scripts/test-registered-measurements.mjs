// Isolated PostgreSQL contract tests; no hosted database or network access.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
const pg = new PGlite();
const migration = (suffix) =>
  readFileSync(
    "supabase/migrations/" +
      readdirSync("supabase/migrations").find((name) =>
        name.endsWith(suffix + ".sql"),
      ),
    "utf8",
  );
const uuid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
await pg.exec(
  readFileSync("backend/tests/fixtures/identifiers_baseline.sql", "utf8"),
);
await pg.exec(migration("identifier_rollout_control"));
await pg.exec(
  "insert into community_xp_control(singleton,enabled,maintenance) values(true,false,false)",
);
for (let i = 1; i <= 6; i++) {
  await pg.query("insert into auth.users values($1)", [uuid(i)]);
  await pg.query("insert into profiles(id) values($1)", [uuid(i)]);
}
await pg.exec(migration("readable_identifiers_expand"));
await pg.exec("update private.identifier_control set maintenance=true");
await pg.exec(migration("numeric_identifier_cutover"));
await pg.exec("update private.identifier_control set maintenance=false");
await pg.exec("update private.identifier_control set maintenance=true");
await pg.exec("begin");
await pg.exec(migration("private_identifier_aliases"));
await pg.exec("commit");
await pg.exec("update private.identifier_control set maintenance=false");
await pg.exec(migration("registered_measurement_locations"));
await pg.exec("update measurement_request_control set registered_enabled=true");
const place = {
  name: "Home",
  address: "Private address",
  lat: 13.8,
  lon: 100.1,
  enabled: true,
};
for (let i = 1; i <= 2; i++)
  await pg.query(
    "select save_measurement_helper_location(6,null,$1::jsonb,false)",
    [JSON.stringify({ ...place, name: "Place " + i })],
  );
await assert.rejects(
  pg.query("select save_measurement_helper_location(6,null,$1::jsonb,false)", [
    JSON.stringify(place),
  ]),
  /location_limit/,
);
await assert.rejects(
  pg.query(
    "insert into measurement_helper_locations(user_id,slot,name,lat,lon) values(6,3,'third',13.8,100.1)",
  ),
  /check constraint/,
);
await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [
  uuid(6),
]);
await pg.exec("set role authenticated");
assert.equal(
  (await pg.query("select * from measurement_helper_locations")).rows.length,
  2,
);
await assert.rejects(
  pg.query("update measurement_helper_locations set name='stolen'"),
  /permission denied/,
);
await pg.exec("reset role");
await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [
  uuid(1),
]);
await pg.exec("set role authenticated");
assert.equal(
  (await pg.query("select * from measurement_helper_locations")).rows.length,
  0,
);
await pg.exec("reset role");
await pg.exec("set role anon");
await assert.rejects(
  pg.query("select * from measurement_helper_locations"),
  /permission denied/,
);
await pg.exec("reset role");
await pg.query("select set_measurement_presence(6,$1::jsonb)", [
  JSON.stringify({ enabled: true }),
]);
// Five independent owners, one report. Their circles all contain the report.
for (let i = 1; i <= 5; i++)
  await pg.query(
    "insert into measurement_requests(user_id,idempotency_key,fingerprint,place_name,lat,lon,radius_km,starts_at,expires_at,status) values($1,$2,$3,'Area',13.8,100.1,3,now()-interval '10 minutes',now()+interval '1 hour','active')",
    [i, uuid(100 + i), "owner-" + i],
  );
for (let i = 1; i <= 5; i++)
  await pg.query("select queue_measurement_group($1,6,true)", [i]);
await pg.query("select queue_measurement_group(1,6,true)");
assert.equal(
  (await pg.query("select * from measurement_notification_batches")).rows
    .length,
  1,
);
assert.equal(
  (await pg.query("select * from notification_outbox")).rows.length,
  1,
);
assert.equal(
  (await pg.query("select * from measurement_request_recipients")).rows.length,
  5,
);
const batch = (
  await pg.query("select id from measurement_notification_batches")
).rows[0].id;
let prepared = (
  await pg.query("select prepare_measurement_group($1,6) data", [batch])
).rows[0].data;
assert.equal(prepared.request_ids.length, 5);
await pg.exec(
  "update measurement_helper_locations set enabled=false where user_id=6",
);
assert.equal(
  (await pg.query("select prepare_measurement_group($1,6) data", [batch]))
    .rows[0].data,
  null,
);
await pg.exec(
  "update measurement_helper_locations set enabled=true where user_id=6",
);
// Upload snapshots use the same verified evidence consumed by existing XP processing.
await pg.query(
  "insert into capture_sessions(user_id,issued_at,expires_at) values(6,now(),now()+interval '5 minutes')",
);
await pg.query(
  "insert into community_reports(user_id,capture_session_id,lat,lon,pm25,status,captured_at,created_at,moderated_at,capture_source,public_lat,public_lon) values(6,1,13.8,100.1,22,'approved',now()-interval '2 minutes',now()-interval '1 minute',now(),'camera',13.801,100.101)",
);
const r = (await pg.query("select * from community_reports where id=1"))
  .rows[0];
const evidence = {
  image_metadata: {
    bonus_gps_at_submission: { lat: 13.8, lon: 100.1, accuracy_m: 20 },
  },
};
await pg.query(
  "insert into community_xp_jobs(report_id,user_id,state,report_snapshot,evidence_snapshot,occurred_at) values(1,6,'pending',$1::jsonb,$2::jsonb,now()) on conflict(report_id) do update set report_snapshot=excluded.report_snapshot,evidence_snapshot=excluded.evidence_snapshot",
  [JSON.stringify(r), JSON.stringify(evidence)],
);
await pg.exec("update community_xp_control set enabled=true");
await pg.query("select process_community_xp(50)");
assert.equal(
  (
    await pg.query(
      "select count(*)::int n from community_xp_events where kind='help'",
    )
  ).rows[0].n,
  0,
  "XP must wait for matching",
);
await pg.query("select process_measurement_report_jobs(50)");
assert.equal(
  (
    await pg.query(
      "select count(*)::int n from measurement_requests where status='fulfilled' and result_report_id=1",
    )
  ).rows[0].n,
  5,
);
await pg.query("select process_measurement_report_jobs(50)");
await pg.query("select process_community_xp(50)");
await pg.query("select process_community_xp(50)");
const bonus = (
  await pg.query(
    "select * from community_xp_events where kind='help' and points>0",
  )
).rows;
assert.equal(bonus.length, 1);
assert.equal(bonus[0].points, 5);
assert.equal(
  (await pg.query("select prepare_measurement_group($1,6) data", [batch]))
    .rows[0].data,
  null,
  "Closed requests must not be delivered",
);
console.log(
  "Registered places: RLS, two-slot cap, batched invitations, five-request fanout and one automatic bonus passed",
);
await pg.close();
