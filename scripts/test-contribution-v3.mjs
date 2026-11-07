// Isolated PostgreSQL contract tests; no hosted database or network access.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
process.on("uncaughtException", (error) => {
  console.error(
    error.message,
    error.where ?? "",
    error.position,
    error.query?.slice(
      Number(error.position) - 180,
      Number(error.position) + 180,
    ),
  );
  process.exit(1);
});
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
await pg.exec(
  "alter table report_reactions add column reason_code text;alter table report_reactions add column geofence_policy text",
);
await pg.exec(migration("contribution_v3_prerequisites"));

await pg.exec(migration("measurement_request_radius_2km"));
await pg.exec(migration("contribution_v3"));
await pg.exec(
  "update community_xp_control set enabled=true;update contribution_v3_control set starts_at='2026-10-01T00:00:00+07:00',enabled=true",
);
const record = async (user, submitted, values = {}) => {
  const session = (
    await pg.query(
      "insert into capture_sessions(user_id,issued_at,expires_at) values($1,$2::timestamptz-interval '2 minutes',$2::timestamptz+interval '3 minutes') returning id",
      [user, submitted],
    )
  ).rows[0].id;
  const row = (
    await pg.query(
      "insert into community_reports(user_id,capture_session_id,lat,lon,pm25,status,captured_at,created_at,moderated_at,capture_source,public_lat,public_lon,measurement_environment,gps_accuracy_m) values($1,$2,13.8,100.1,22,'approved',$3::timestamptz-interval '1 minute',$3::timestamptz,$3::timestamptz,'camera',13.801,100.101,'outdoor',20) returning *",
      [user, session, submitted],
    )
  ).rows[0];
  const evidence = {
    image_metadata: {
      evidence_extraction: { pm25_field_verified: true, unit_verified: true },
      bonus_gps_at_submission: { lat: 13.8, lon: 100.1, accuracy_m: 20 },
    },
  };
  await pg.query(
    "insert into community_xp_jobs(report_id,user_id,state,report_snapshot,evidence_snapshot,occurred_at) values($1,$2,'pending',$3::jsonb,$4::jsonb,$5) on conflict(report_id) do update set report_snapshot=excluded.report_snapshot,evidence_snapshot=excluded.evidence_snapshot",
    [
      row.id,
      user,
      JSON.stringify({ ...row, ...values }),
      JSON.stringify(evidence),
      submitted,
    ],
  );
  if (values.__defer) return row;
  await pg.query("select process_measurement_report_jobs(50)");
  await pg.query("select process_community_xp(50)");
  return row;
};
const settle = async () => {
  for (let i = 0; i < 20; i++) {
    await pg.query("select process_measurement_report_jobs(100)");
    await pg.query("select process_community_xp(100)");
  }
};
const balance = async (u) =>
  (await pg.query("select lifetime_xp from community_xp_totals($1)", [u]))
    .rows[0].lifetime_xp;
const start = Date.parse("2026-10-26T03:00:00Z");
for (let i = 0; i < 6; i++)
  await record(1, new Date(start + i * 30 * 60000).toISOString());
await settle();
assert.equal(await balance(1), 55, "five base reports plus first day");
await settle();
assert.equal(await balance(1), 55, "retry never awards twice");
for (let d of [27, 28, 29, 30]) await record(1, `2026-10-${d}T03:00:00Z`);
await settle();
assert.equal(await balance(1), 135, "five weekly days add twenty once");
await record(1, "2026-10-31T03:00:00Z");
await settle();
assert.equal(await balance(1), 150, "sixth day no weekly repeat");
assert.equal(
  (
    await pg.query(
      "select count(*)::int n from community_xp_events where user_id=1 and kind='contribution_week'",
    )
  ).rows[0].n,
  1,
);
// Every version participates in cooldown/quota and the calendar-month ranking.
await pg.query(
  "insert into community_xp_accounts(user_id) values(2) on conflict do nothing",
);
await pg.query(
  "insert into community_xp_events(user_id,kind,points,reason,occurred_at,policy_version) values(2,'help',5,'legacy','2026-10-26T03:00:00Z','xp-v1')",
);
await record(2, "2026-10-26T03:29:59Z");
await settle();
assert.equal(await balance(2), 5, "legacy service award starts cooldown");
await record(2, "2026-10-26T03:30:00Z");
await settle();
assert.equal(await balance(2), 20);
assert.equal(
  (await pg.query("select community_v2_month_points('2026-10',2) n")).rows[0].n,
  20,
);
// Server submission chooses the policy before worker time, and pause never falls back to legacy awards.
const before = await record(3, "2026-09-30T16:59:00Z", { __defer: true });
assert.equal(
  (
    await pg.query(
      "select policy_version from community_xp_jobs where report_id=$1",
      [before.id],
    )
  ).rows[0].policy_version,
  "xp-v1",
);
await pg.exec("update contribution_v3_control set enabled=false,paused=true");
const paused = await record(3, "2026-10-27T03:00:00Z", { __defer: true });
await settle();
assert.equal(
  (
    await pg.query("select state from community_xp_jobs where report_id=$1", [
      paused.id,
    ])
  ).rows[0].state,
  "pending",
);
await pg.exec("update contribution_v3_control set enabled=true,paused=false");
await settle();
assert.equal(
  (
    await pg.query("select state from community_xp_jobs where report_id=$1", [
      paused.id,
    ])
  ).rows[0].state,
  "done",
);
// Positive/negative PM values never scale XP. Invalid numeric values receive no base reward.
await record(4, "2026-10-27T03:00:00Z", { pm25: -1 });
await settle();
assert.equal(await balance(4), 0);
await record(4, "2026-10-27T03:01:00Z", { pm25: 0 });
await settle();
assert.equal(await balance(4), 15);
await record(4, "2026-10-27T03:31:00Z", { pm25: 999 });
await settle();
assert.equal(await balance(4), 25);
// Revoking a report leaves quota consumed and dependent bonuses reconcile once.
const awarded = (
  await pg.query(
    "select id from community_xp_events where user_id=4 and kind='report' and points>0 order by occurred_at",
  )
).rows;
for (const e of awarded)
  await pg.query(
    "select reverse_community_xp($1,'confirmed-test-fixture-ineligible')",
    [e.id],
  );
await pg.query("select reconcile_contribution_v3()");
await pg.query("select reconcile_contribution_v3()");
assert.equal(await balance(4), 0);
for (const role of ["anon", "authenticated"]) {
  await pg.exec("set role " + role);
  await assert.rejects(
    pg.query("select contribution_v3_release()"),
    /permission denied/,
  );
  await assert.rejects(
    pg.query("select process_community_xp(100)"),
    /permission denied/,
  );
  await pg.exec("reset role");
}
// Base cap leaves service quota available. Request pairs and the shared cap still apply.
for (let i = 0; i < 5; i++)
  await record(5, new Date(start + i * 30 * 60000).toISOString());
await settle();
assert.equal(await balance(5), 55);
const help = async (requester, minutes) => {
  const at = new Date(start + minutes * 60000).toISOString();
  const q = (
    await pg.query(
      "insert into measurement_requests(user_id,idempotency_key,fingerprint,place_name,lat,lon,radius_km,starts_at,expires_at,status,created_at) values($1,$2,$3,'Public area',13.8,100.1,2,$4::timestamptz-interval '10 minutes',$4::timestamptz+interval '1 hour','active',$4::timestamptz-interval '10 minutes') returning id",
      [requester, uuid(9000 + minutes), "v3-help-" + minutes, at],
    )
  ).rows[0].id;
  const r = await record(5, at, { __defer: true });
  await pg.query(
    "update measurement_report_jobs set state='done' where report_id=$1",
    [r.id],
  );
  await pg.query(
    "insert into measurement_report_matches(report_id,request_id) values($1,$2)",
    [r.id, q],
  );
  await settle();
  return r;
};
await help(1, 150);
assert.equal(await balance(5), 60, "bonus-only after five base reports");
await help(1, 180);
assert.equal(await balance(5), 60, "same requester once a day");
await help(2, 210);
await help(3, 240);
assert.equal(await balance(5), 70, "maximum normal day");
await help(4, 270);
assert.equal(await balance(5), 70, "shared service cap");
// Preannounced overlapping missions close atomically and never multiply a report bonus.
await pg.exec(
  'update contribution_v3_control set missions_enabled=true,refs=\'{"coverage_validation_ref":"isolated-test-fixture-only"}\'',
);
for (let i = 0; i < 2; i++)
  await pg.query(
    "insert into community_coverage_missions(area_key,place_name,lat,lon,starts_at,expires_at,inputs,policy_version) values($1,'public centre',13.8,100.1,'2026-10-28T02:50:00Z','2026-10-28T04:00:00Z','{}','contribution-v3')",
    ["v3-overlap-" + i],
  );
const winner = await record(6, "2026-10-28T03:00:00Z");
await settle();
assert.equal(await balance(6), 20);
assert.equal(
  (
    await pg.query(
      "select count(*)::int n from community_coverage_missions where fulfilled_report_id=$1 and state='fulfilled'",
      [winner.id],
    )
  ).rows[0].n,
  1,
);
assert.equal(
  (
    await pg.query(
      "select count(*)::int n from community_coverage_missions where area_key like 'v3-overlap-%' and state='open'",
    )
  ).rows[0].n,
  0,
);
await record(6, "2026-10-28T03:30:00Z");
await settle();
assert.equal(await balance(6), 30, "no repeat area bonus");
// Pair quota persists across days, including old versions and reversals.
for (const [day, expected] of [
  [27, 90],
  [28, 110],
  [29, 125],
]) {
  const at = `2026-10-${day}T03:00:00Z`;
  const q = (
    await pg.query(
      "insert into measurement_requests(user_id,idempotency_key,fingerprint,place_name,lat,lon,radius_km,starts_at,expires_at,status,created_at) values(1,$1,$2,'public',13.8,100.1,2,$3::timestamptz-interval '10 minutes',$3::timestamptz+interval '1 hour','active',$3::timestamptz-interval '10 minutes') returning id",
      [uuid(20000 + day), "pair-" + day, at],
    )
  ).rows[0].id;
  const r = await record(5, at, { __defer: true });
  await pg.query(
    "update measurement_report_jobs set state='done' where report_id=$1",
    [r.id],
  );
  await pg.query(
    "insert into measurement_report_matches(report_id,request_id) values($1,$2)",
    [r.id, q],
  );
  await settle();
  assert.equal(
    await balance(5),
    expected,
    "at most three bonus days from requester in rolling seven days",
  );
}
// Restoring a valid day after confirmed reversal creates a compensating bonus only once.
await record(4, "2026-10-27T04:01:00Z");
await settle();
await pg.query("select reconcile_contribution_v3()");
assert.equal(await balance(4), 15);
await pg.query("select reconcile_contribution_v3()");
assert.equal(await balance(4), 15);
// Global submission ordering protects a mission when an older user's matching is delayed.
await pg.query(
  "insert into community_coverage_missions(area_key,place_name,lat,lon,starts_at,expires_at,inputs,policy_version) values('delayed-order','public centre',13.8,100.1,'2026-10-30T02:50:00Z','2026-10-30T04:00:00Z','{}','contribution-v3')",
);
const later = await record(5, "2026-10-30T03:01:00Z", { __defer: true });
const earlier = await record(6, "2026-10-30T03:00:00Z", { __defer: true });
await pg.query(
  "update measurement_report_jobs set state='done' where report_id=$1",
  [later.id],
);
await pg.query("select process_community_xp(100)");
assert.equal(
  (
    await pg.query(
      "select count(*)::int n from community_xp_events where report_id=$1",
      [later.id],
    )
  ).rows[0].n,
  0,
  "later report waits for earlier matching",
);
await pg.query(
  "update measurement_report_jobs set state='done' where report_id=$1",
  [earlier.id],
);
await settle();
assert.equal(
  (
    await pg.query(
      "select fulfilled_report_id from community_coverage_missions where area_key='delayed-order'",
    )
  ).rows[0].fulfilled_report_id,
  earlier.id,
);
console.log(
  "contribution-v3 SQL: migration, legacy preservation, 55 base/day, 5-day week, cross-version cooldown/month, fixed job policy, pause/retry, PM-independent awards, reversals and role isolation passed",
);
await pg.close();
