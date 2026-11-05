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
await pg.exec(migration("contribution_evidence_v2"));
assert.equal(
  (await pg.query("select active_version from community_policy_release"))
    .rows[0].active_version,
  "v1",
);
for (const reference of [null, "", "   "]) {
  await assert.rejects(
    pg.query(
      "update community_policy_release set reaction_radius_m=120,reaction_validation_ref=$1",
      [reference],
    ),
    /check constraint/,
  );
}
await pg.query(
  "update community_policy_release set reaction_radius_m=120,reaction_validation_ref=$1",
  ["test-fixture-only:not-field-validation"],
);
await pg.exec(
  "update community_policy_release set reaction_radius_m=null,reaction_validation_ref=null",
);
for (const role of ["anon", "authenticated"]) {
  await pg.exec("set role " + role);
  await assert.rejects(
    pg.query("update community_policy_release set reaction_radius_m=500"),
    /permission denied/,
  );
  await pg.exec("reset role");
}

// Existing lifetime balance survives cutover unchanged.
await pg.exec("insert into community_xp_accounts(user_id) values(1)");
await pg.exec(
  "insert into community_xp_events(user_id,kind,points,reason,occurred_at) values(1,'report',10,'legacy',now()-interval '40 days')",
);
await pg.exec("update community_xp_control set enabled=true");
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
await record(4, new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
assert.equal(
  (await pg.query("select lifetime_xp from community_xp_totals(4)")).rows[0]
    .lifetime_xp,
  10,
  "v1 jobs retain old rules after schema migration",
);
await pg.exec(
  "update community_policy_release set active_version='v2',launched_at='2026-10-01T00:00:00+07:00',evidence_threshold=70,evidence_validation_ref='test-fixture-only:not-field-validation'",
);
await pg.exec("update community_xp_control set enabled=true");
assert.equal(
  (await pg.query("select lifetime_xp from community_xp_totals(1)")).rows[0]
    .lifetime_xp,
  10,
);
const now = new Date();
for (let user = 1; user <= 5; user++)
  await pg.query(
    "insert into measurement_requests(user_id,idempotency_key,fingerprint,place_name,lat,lon,radius_km,starts_at,expires_at,status) values($1,$2,$3,'Area',13.8,100.1,3,now()-interval '10 minutes',now()+interval '1 hour','active')",
    [user, uuid(100 + user), "v2-" + user],
  );
const first = await record(6, now.toISOString());
assert.equal(
  (
    await pg.query(
      "select count(*)::int n from measurement_report_matches where report_id=$1",
      [first.id],
    )
  ).rows[0].n,
  5,
);
assert.equal(
  (
    await pg.query(
      "select sum(points)::int points from community_xp_events where user_id=6",
    )
  ).rows[0].points,
  20,
);
assert.equal(
  (
    await pg.query(
      "select count(*)::int n from community_xp_events where user_id=6 and kind='help' and points>0",
    )
  ).rows[0].n,
  1,
);
await Promise.all([
  pg.query("select process_community_xp(50)"),
  pg.query("select process_community_xp(50)"),
]);
assert.equal(
  (
    await pg.query(
      "select sum(points)::int points from community_xp_events where user_id=6",
    )
  ).rows[0].points,
  20,
);
await pg.exec("update profiles set reputation_score=45 where id=1");
await pg.query(
  "select apply_reputation_event(1,10,'report_approved',$1,'v2-frozen-legacy-reputation')",
  [first.id],
);
assert.equal(
  (await pg.query("select reputation_score from profiles where id=1")).rows[0]
    .reputation_score,
  45,
);
// Five distinct days, event time remains October despite November settlement.
let dayOne;
for (let day = 26; day <= 30; day++) {
  const report = await record(2, `2026-10-${day}T03:00:00Z`);
  if (!dayOne) dayOne = report;
}
assert.equal(
  (await pg.query("select lifetime_xp from community_xp_totals(2)")).rows[0]
    .lifetime_xp,
  95,
);
const monthBoard = (
  await pg.query("select community_v2_month_board('2026-10',0,2) data")
).rows[0].data;
assert.equal(monthBoard.me.xp, 95);
assert.equal(
  (await pg.query("select community_v2_month_board('2026-11',0,2) data"))
    .rows[0].data.me,
  null,
);
await pg.query("select freeze_community_seasons()");
assert.equal(
  (
    await pg.query(
      "select revision from community_season_results where month='2026-10-01'",
    )
  ).rows[0].revision,
  1,
);
await pg.query(
  "insert into community_evidence_outcomes(user_id,report_id,scope,outcome,evaluation_key,provenance,policy_version,invalidates_contribution) values(2,$1,'metadata','problem','confirmed-invalid-fixture','independent-fixture','evidence-v2',true)",
  [dayOne.id],
);
await pg.query("select reconcile_community_v2()");
await pg.query("select reconcile_community_v2()");
assert.equal(
  (await pg.query("select lifetime_xp from community_xp_totals(2)")).rows[0]
    .lifetime_xp,
  60,
);
await pg.query("select freeze_community_seasons()");
assert.equal(
  (
    await pg.query(
      "select revision from community_season_results where month='2026-10-01'",
    )
  ).rows[0].revision,
  2,
);

// A qualifying event can settle after its task expired; worker time isn't event time.
await pg.exec(
  "insert into community_coverage_missions(area_key,place_name,lat,lon,starts_at,expires_at,state,inputs) values('fixture-late','Past public area',13.8,100.1,now()-interval '3 hours',now()-interval '90 minutes','expired','{}')",
);
await record(5, new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());
assert.equal(
  (
    await pg.query(
      "select sum(points)::int points from community_xp_events where user_id=5",
    )
  ).rows[0].points,
  20,
);
// Mission/adjacent-task replay prevention, durable rank notification.
await pg.exec(
  "insert into community_xp_accounts(user_id) values(3) on conflict do nothing",
);
await pg.exec(
  "insert into community_xp_events(user_id,kind,points,reason,occurred_at) select 3,'report',10,'legacy',now()-interval '40 days' from generate_series(1,9)",
);
await pg.exec(
  "insert into community_coverage_missions(area_key,place_name,lat,lon,starts_at,expires_at,inputs) values('fixture-a','Public area',13.8,100.1,now()-interval '10 minutes',now()+interval '1 hour','{}'),('fixture-b','Adjacent area',13.8001,100.1,now()-interval '9 minutes',now()+interval '1 hour','{}')",
);
const missionReport = await record(3, new Date().toISOString());
assert.equal(
  (
    await pg.query(
      "select sum(points)::int points from community_xp_events where user_id=3",
    )
  ).rows[0].points,
  110,
);
assert.equal(
  (
    await pg.query(
      "select count(*)::int n from user_notifications where user_id=3 and event_type='rank_up'",
    )
  ).rows[0].n,
  1,
);
assert.equal(
  (
    await pg.query(
      "select count(*)::int n from community_coverage_missions where state='open'",
    )
  ).rows[0].n,
  0,
);
await record(4, new Date().toISOString());
assert.equal(
  (
    await pg.query(
      "select count(*)::int n from community_xp_events where user_id=4 and kind='help' and points>0",
    )
  ).rows[0].n,
  0,
);
const controlled = {
  user_id: "USR-000003",
  report_id: `RPT-${String(missionReport.id).padStart(6, "0")}`,
  scope: "field_protocol",
  outcome: "pass",
  evaluation_key: "independent-fixture-source",
  provenance: "independent-fixture-protocol",
  evaluated_at: new Date().toISOString(),
  source_key: "private-source-fixture",
};
await pg.query("select ingest_community_evaluation($1::jsonb)", [
  JSON.stringify(controlled),
]);
await pg.query("select ingest_community_evaluation($1::jsonb)", [
  JSON.stringify(controlled),
]);
assert.equal(
  (
    await pg.query(
      "select count(*)::int n from community_evidence_outcomes where evaluation_key='independent-fixture-source'",
    )
  ).rows[0].n,
  1,
);
assert.equal(
  (
    await pg.query(
      "select measurement_source_key from community_reports where id=$1",
      [missionReport.id],
    )
  ).rows[0].measurement_source_key,
  "private-source-fixture",
);
// Rollback preserves accepted v2 job ownership and already earned lifetime points.
const deferred = await record(1, new Date().toISOString(), { __defer: true });
await pg.query("select set_community_v2_release(false,null,null)");
await pg.query("select process_measurement_report_jobs(50)");
await pg.query("select process_community_xp(50)");
assert.equal(
  (await pg.query("select lifetime_xp from community_xp_totals(6)")).rows[0]
    .lifetime_xp,
  20,
);
assert.equal(
  (
    await pg.query(
      "select policy_version from community_xp_events where report_id=$1 and kind='report'",
      [deferred.id],
    )
  ).rows[0].policy_version,
  "contribution-v2",
);
assert.equal(
  (await pg.query("select lifetime_xp from community_xp_totals(1)")).rows[0]
    .lifetime_xp,
  25,
);
// Configuration and all mutation/read helpers are server-only.
for (const role of ["anon", "authenticated"]) {
  await pg.exec("set role " + role);
  for (const query of [
    "select * from community_evidence_outcomes",
    "select reconcile_community_v2()",
    "select publish_community_missions('[]'::jsonb)",
    "select community_v2_month_board('2026-10',0,null)",
  ])
    await assert.rejects(pg.query(query), /permission denied/);
  await pg.exec("reset role");
}
console.log(
  "V2 SQL: preserved legacy points, five-request fanout/one bonus, replay, weekly awards, event-month attribution, 72h freeze, compensation, revisions and RLS passed.",
);
await pg.close();
