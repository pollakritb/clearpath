// Atomic cutover against actual schema and write RPCs, with legacy retry evidence.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
const pg = new PGlite();
const sql = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = (suffix) =>
  sql(
    "../supabase/migrations/" +
      readdirSync(new URL("../supabase/migrations/", import.meta.url)).find(
        (x) => x.endsWith(suffix + ".sql"),
      ),
  );
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
await pg.exec(sql("../backend/tests/fixtures/identifiers_baseline.sql"));
await pg.exec(migration("identifier_rollout_control"));
await pg.exec(
  "insert into community_xp_control(singleton,enabled,maintenance) values(true,false,false)",
);
for (const n of [1, 2, 3]) {
  await pg.query("insert into auth.users values($1)", [uid(n)]);
  await pg.query("insert into profiles(id) values($1)", [uid(n)]);
}
await pg.query(
  "insert into capture_sessions(id,user_id,issued_at,expires_at) values($1,$2,now(),now()+interval '5 minutes')",
  [uid(10), uid(1)],
);
await pg.query(
  "insert into community_reports(id,user_id,capture_session_id,lat,lon,pm25,status,captured_at,public_lat,public_lon) values($1,$2,$3,14,100,20,'approved',now(),14.001,100.001)",
  [uid(100), uid(1), uid(10)],
);
await pg.query(
  "insert into report_comments(id,report_id,user_id,body) values($1,$2,$3,'dummy')",
  [uid(200), uid(100), uid(2)],
);
await pg.query(
  "insert into community_xp_accounts(user_id,member_id) values($1,$2)",
  [uid(1), uid(300)],
);
await pg.query(
  "insert into community_xp_events(user_id,report_id,kind,points,reason,occurred_at) values($1,$2,'report',10,'granted',now())",
  [uid(1), uid(100)],
);
const before = (await pg.query("select * from community_reports")).rows[0];
await pg.exec("begin");
await pg.exec(migration("readable_identifiers_expand"));
await pg.exec("commit");
// A cutover without the global write pause is rejected before any mutation.
await pg.exec("begin");
await assert.rejects(
  pg.exec(migration("numeric_identifier_cutover")),
  /requires_write_pause/,
);
await pg.exec("rollback");
await pg.exec("update private.identifier_control set maintenance=true");
await assert.rejects(
  pg.query("update profiles set display_name='blocked'"),
  /identifier_maintenance/,
);
await pg.exec("begin");
await pg.exec(migration("numeric_identifier_cutover"));
await pg.exec("commit");
assert.equal(
  (await pg.query("select identifier_schema_state() s")).rows[0].s.version,
  2,
);
await pg.exec("update private.identifier_control set maintenance=false");
const profiles = (await pg.query("select * from profiles order by id")).rows;
assert.equal(profiles[0].code, "USR-000001");
assert.equal(profiles[0].auth_user_id, uid(1));
const r = (await pg.query("select * from community_reports")).rows[0];
assert.equal(r.id, 1);
assert.equal(r.user_id, 1);
assert.equal(r.capture_session_id, 1);
assert.equal(r.legacy_id, uid(100));
assert.equal(r.public_lat, before.public_lat);
assert.equal(r.public_lon, before.public_lon);
assert.equal(r.updated_at.getTime(), before.updated_at.getTime());
const legacy = (
  await pg.query("select identifier_resolve('community_reports',$1) s", [
    uid(100),
  ])
).rows[0].s;
assert.equal(legacy.code, "RPT-000001");
assert.equal(
  (
    await pg.query(
      "select identifier_resolve('community_reports','USR-000001') s",
    )
  ).rows[0].s,
  null,
);
// Existing aliases do not become a different entity when a failed pending insert is retried.
await pg.query(
  "insert into capture_sessions(legacy_id,user_id,issued_at,expires_at) values($1,2,now(),now()+interval '5 minutes')",
  [uid(11)],
);
await pg.query(
  "insert into community_reports(legacy_id,user_id,capture_session_id,lat,lon,captured_at) values($1,2,2,14,100,now())",
  [uid(101)],
);
const retryID = (
  await pg.query("select id from community_reports where legacy_id=$1", [
    uid(101),
  ])
).rows[0].id;
await pg.query("delete from community_reports where id=$1", [retryID]);
await pg.query(
  "insert into community_reports(legacy_id,user_id,capture_session_id,lat,lon,captured_at) values($1,2,2,14,100,now())",
  [uid(101)],
);
assert.equal(
  (
    await pg.query("select id from community_reports where legacy_id=$1", [
      uid(101),
    ])
  ).rows[0].id,
  retryID,
);
// Finalize automatically via the existing moderation RPC; notification/reputation dedup stays stable.
await pg.query(
  "select moderate_community_report_v2($1,null,'approve',25,null,'{\"image_clear\":true,\"value_matches_display\":true,\"location_plausible\":true,\"no_screen_recapture_signs\":true}','automatic-review-test',65,'[]')",
  [retryID],
);
assert.equal(
  (await pg.query("select deduplication_key from user_notifications")).rows[0]
    .deduplication_key,
  "report_status:" + uid(101),
);
assert.equal(
  (await pg.query("select idempotency_key from reputation_events")).rows[0]
    .idempotency_key,
  "moderation:v2:" + uid(101),
);
// JSON RPCs generate numeric identities and retain UUID idempotency keys.
const now = new Date(),
  row = {
    legacy_id: uid(400),
    user_id: 1,
    idempotency_key: uid(401),
    fingerprint: "dummy",
    place_name: "dummy",
    lat: 14,
    lon: 100,
    radius_km: 3,
    starts_at: now.toISOString(),
    expires_at: new Date(+now + 3600000).toISOString(),
    status: "active",
    result_report_id: null,
    dispatch_cursor: null,
    last_processed_at: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
const created = (
  await pg.query("select create_measurement_request($1) s", [row])
).rows[0].s.row;
assert.equal(created.code, "REQ-000001");
assert.equal(
  (
    await pg.query("select create_measurement_request($1) s", [
      { ...row, legacy_id: uid(402) },
    ])
  ).rows[0].s.row.id,
  created.id,
);
await pg.query("select finish_measurement_request($1,'expired')", [created.id]);
const notice = {
  legacy_id: uid(500),
  user_id: 1,
  event_type: "measurement_expired",
  title: "dummy",
  body: "dummy",
  url: "/requests/REQ-000001",
  entity_type: "measurement_request",
  entity_id: "REQ-000001",
  payload: {},
  deduplication_key: "measurement:" + uid(400) + ":expired:" + uid(1),
  read_at: null,
  created_at: now.toISOString(),
};
const outbox = {
  legacy_id: uid(501),
  legacy_notification_id: uid(500),
  user_id: 1,
  notification_id: null,
  event_key: notice.deduplication_key + ":line",
  payload: { retry_key: uid(501) },
  status: "pending",
  attempts: 0,
  next_attempt_at: now.toISOString(),
  last_error: null,
  processed_at: null,
  created_at: now.toISOString(),
  updated_at: now.toISOString(),
};
for (let i = 0; i < 2; i++)
  await pg.query("select notify_measurement_request($1,$2)", [notice, outbox]);
assert.equal(
  (await pg.query("select count(*) n from user_notifications where user_id=1"))
    .rows[0].n,
  1,
);
assert.equal(
  (await pg.query("select count(*) n from notification_outbox where user_id=1"))
    .rows[0].n,
  1,
);
assert.equal(
  (
    await pg.query(
      "select payload->>'retry_key' s from notification_outbox where user_id=1",
    )
  ).rows[0].s,
  uid(501),
);
// XP worker consumes code references in metadata without changing quotas/trust.
await pg.exec("update community_xp_control set enabled=true");
const helpRequest = (
  await pg.query("select create_measurement_request($1) s", [
    {
      ...row,
      legacy_id: uid(410),
      idempotency_key: uid(411),
      fingerprint: "help",
      starts_at: new Date(+now - 3600000).toISOString(),
    },
  ])
).rows[0].s.row;
await pg.query(
  "insert into measurement_request_recipients(request_id,user_id,matched_location_at) values($1,3,now())",
  [helpRequest.id],
);
await pg.query("select claim_community_help(3,$1)", [helpRequest.id]);
await pg.query(
  "update community_help_claims set started_at=now()-interval '10 minutes' where request_id=$1",
  [helpRequest.id],
);
const cap = (
  await pg.query(
    "insert into capture_sessions(user_id,issued_at,expires_at) values(3,now(),now()+interval '5 minutes') returning id",
  )
).rows[0].id;
const xpReport = (
  await pg.query(
    "insert into community_reports(user_id,capture_session_id,lat,lon,captured_at) values(3,$1,14,100,now()-interval '1 minute') returning id",
    [cap],
  )
).rows[0].id;
await pg.query(
  "insert into report_evidence(report_id,image_metadata) values($1,$2)",
  [
    xpReport,
    {
      measurement_request_id: helpRequest.code,
      bonus_gps_at_submission: { lat: 14, lon: 100, accuracy_m: 10 },
    },
  ],
);
await pg.query(
  "update community_reports set status='approved',pm25=20,moderated_at=now() where id=$1",
  [xpReport],
);
await pg.exec(
  "select process_community_xp(50);select process_community_xp(50)",
);
assert.equal(
  (await pg.query("select lifetime_xp from community_xp_totals(3)")).rows[0]
    .lifetime_xp,
  15,
);
// CAMS publication must use named columns after legacy fields have been retained.
const lease = uid(999),
  slot = new Date();
slot.setUTCHours(Math.floor(slot.getUTCHours() / 6) * 6, 0, 0, 0);
const job = (
  await pg.query("select claim_cams_grid($1,$2,$3,1) s", [
    slot.toISOString(),
    lease,
    { id: "test-grid", latitudes: [13, 14], longitudes: [99, 100] },
  ])
).rows[0].s;
assert.equal(job.status, "claimed");
assert.equal(
  (
    await pg.query("select lease_token from cams_grid_jobs where id=$1", [
      job.id,
    ])
  ).rows[0].lease_token,
  lease,
);
await pg.query("select checkpoint_cams_grid($1,$2,0,$3)", [
  job.id,
  lease,
  { cells: [] },
]);
await pg.query("select publish_cams_grid($1,$2,$3,'dummy-fingerprint')", [
  job.id,
  lease,
  [
    {
      valid_at: new Date(+now + 3600000).toISOString(),
      values: [10, 11, 12, 13],
    },
  ],
]);
assert.equal(
  (await pg.query("select generation_id from cams_grid_active")).rows[0]
    .generation_id,
  job.generation_id,
);
// RLS uses explicit auth linkage and never compares bigint to auth.uid().
await pg.exec("set role authenticated");
await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [uid(1)]);
assert.equal((await pg.query("select count(*) n from profiles")).rows[0].n, 1);
assert.equal(
  (await pg.query("select count(*) n from user_notifications")).rows[0].n,
  1,
);
await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [uid(3)]);
assert.equal(
  (await pg.query("select count(*) n from user_notifications")).rows[0].n,
  0,
);
await assert.rejects(
  pg.query("select identifier_resolve('profiles','USR-000001')"),
  /permission denied/,
);
await pg.exec("reset role");
// All entity/reference PK columns are numeric; natural/composite provider keys remain intact.
const keys = (
  await pg.query(
    "select c.relname,a.attname,t.typname from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace cross join lateral unnest(k.conkey) key(attnum) join pg_attribute a on a.attrelid=c.oid and a.attnum=key.attnum join pg_type t on t.oid=a.atttypid where k.contype='p' and n.nspname='public'",
  )
).rows;
assert(!keys.some((k) => k.typname === "uuid"));
console.log(
  "Numeric cutover: pause/rollback guards, bigint PK/FK, old aliases, stable pins/dedup, retry resurrection, moderation, request/outbox RPCs and ownership RLS passed.",
);
await pg.exec("update private.identifier_control set maintenance=true;begin;");
await pg.exec(migration("private_identifier_aliases"));
await pg.exec(
  "commit;update private.identifier_control set maintenance=false;",
);
assert.equal(
  (
    await pg.query(
      "select count(*) n from information_schema.columns where table_schema='public' and left(column_name,7)='legacy_' ",
    )
  ).rows[0].n,
  0,
);
await pg.exec(sql("../backend/tests/fixtures/clean_identifiers_checks.sql"));
console.log(
  "Clean schema: public legacy columns removed; retry resurrection, moderation and request/outbox RPCs passed.",
);
// Retirement must refuse unexpected data and leave unrelated features intact.
await pg.exec(sql("../supabase/bootstrap/recent_history_retention.sql"));
await pg.exec(
  "begin;insert into stations(id,lat,lon) values('retire-test',14,100);insert into weather_observations(station_id,recorded_at,source_at) values('retire-test',now(),now());",
);
await assert.rejects(
  pg.exec(migration("retire_model_feature_storage")),
  /must_be_empty/,
);
await pg.exec("rollback;begin;");
await pg.exec(migration("retire_model_feature_storage"));
await pg.exec("commit;");
assert.equal(
  (
    await pg.query(
      "select count(*) n from information_schema.tables where table_schema='public' and table_type='BASE TABLE'",
    )
  ).rows[0].n,
  41,
);
assert(
  (
    await pg.query(
      "select to_regclass('public.cams_grid_frames') is not null and to_regclass('public.forecast_provider_snapshots') is not null and to_regclass('public.community_reports') is not null retained",
    )
  ).rows[0].retained,
);
assert.equal(
  (await pg.query("select count(*) n from pg_views where schemaname='review'"))
    .rows[0].n,
  41,
);
await pg.query("select private.prune_recent_history(1)");
console.log(
  "Retired model feature tables: nonempty guard, 41-table inventory, retained CAMS/community and working cleanup passed.",
);
// Open discovery must allow volunteering without an invitation; quotas remain atomic.
await pg.exec(migration("open_measurement_requests_single_active"));
const requestRow = (n, owner = 2) => ({
  ...row,
  user_id: owner,
  legacy_id: uid(n),
  idempotency_key: uid(n + 1),
  fingerprint: `open-${n}`,
  starts_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 3600000).toISOString(),
});
const makeRequest = async (data) =>
  (await pg.query("select create_measurement_request($1) s", [data])).rows[0].s;
const openRow = requestRow(800);
const firstOpen = (await makeRequest(openRow)).row;
assert(firstOpen);
assert.equal((await makeRequest(openRow)).row.id, firstOpen.id);
assert.equal((await makeRequest(requestRow(802))).error, "active_limit");
const volunteer = (
  await pg.query("select claim_community_help(3,$1) s", [firstOpen.id])
).rows[0].s;
assert.equal(volunteer.potential_xp, 5);
assert.equal(
  (
    await pg.query(
      "select count(*) n from measurement_request_recipients where request_id=$1",
      [firstOpen.id],
    )
  ).rows[0].n,
  0,
);
assert.equal(
  (await pg.query("select claim_community_help(3,$1) s", [firstOpen.id]))
    .rows[0].s.started_at,
  volunteer.started_at,
);
await pg.query("select finish_measurement_request($1,'cancelled')", [
  firstOpen.id,
]);
const afterCancel = (await makeRequest(requestRow(804))).row;
assert(afterCancel);
await pg.query("select finish_measurement_request($1,'fulfilled')", [
  afterCancel.id,
]);
assert((await makeRequest(requestRow(806))).row);
const clockRow = (await makeRequest(requestRow(810, 3))).row;
assert(clockRow);
await pg.query(
  "update measurement_requests set starts_at=now()-interval '1 hour', expires_at=now()-interval '1 second' where id=$1",
  [clockRow.id],
);
assert((await makeRequest(requestRow(812, 3))).row);
assert.equal(
  (
    await pg.query(
      "select has_function_privilege('authenticated','public.claim_community_help(bigint,bigint)','execute') allowed",
    )
  ).rows[0].allowed,
  false,
);
console.log(
  "Single active slot, retries, cancellation/success/expiry release, and uninvited volunteering passed.",
);
// Identity defaults preserve existing aliases while new members start with Google.
await pg.exec(migration("community_identity_preferences"));
assert.equal(
  (
    await pg.query(
      "select identity_mode from community_xp_accounts where user_id=1",
    )
  ).rows[0].identity_mode,
  "alias",
);
await pg.query("insert into auth.users values($1)", [uid(900)]);
await pg.query("insert into profiles(auth_user_id) values($1)", [uid(900)]);
await pg.query(
  "insert into community_xp_accounts(user_id) select id from profiles where auth_user_id=$1",
  [uid(900)],
);
assert.equal(
  (
    await pg.query(
      "select identity_mode from community_xp_accounts where user_id=(select id from profiles where auth_user_id=$1)",
      [uid(900)],
    )
  ).rows[0].identity_mode,
  "google",
);
assert.equal(
  (
    await pg.query(
      "select count(*) n from community_reports where anonymous_alias is not null",
    )
  ).rows[0].n,
  0,
);
console.log(
  "Identity migration: existing aliases preserved, new Google default, anonymous reports not backfilled passed.",
);
// Simultaneous open requests belong to different accounts, never a global slot.
const independentOwner = (
  await pg.query("select id from profiles where auth_user_id=$1", [uid(900)])
).rows[0].id;
assert((await makeRequest(requestRow(920, independentOwner))).row);
assert.equal(
  (await makeRequest(requestRow(922, independentOwner))).error,
  "active_limit",
);
assert(
  (
    await pg.query(
      "select count(distinct user_id) n from measurement_requests where status in ('active','scheduled') and expires_at>now()",
    )
  ).rows[0].n >= 3,
);
console.log(
  "Per-account active slots: multiple requesters coexist and only their own second request is blocked.",
);
// Current policy increases the combined active/scheduled limit to two.
await pg.exec(migration("measurement_requests_two_open"));
const secondOpen = (
  await makeRequest({
    ...requestRow(922, independentOwner),
    status: "scheduled",
    starts_at: new Date(Date.now() + 600000).toISOString(),
  })
).row;
assert(secondOpen);
assert.equal(
  (await makeRequest(requestRow(924, independentOwner))).error,
  "active_limit",
);
assert.equal(
  (await makeRequest(requestRow(922, independentOwner))).row.id,
  secondOpen.id,
);
await pg.query("select finish_measurement_request($1,'cancelled')", [
  secondOpen.id,
]);
assert((await makeRequest(requestRow(924, independentOwner))).row);
assert.equal(
  (await makeRequest(requestRow(926, independentOwner))).error,
  "daily_limit",
);
assert.equal(
  (await makeRequest(requestRow(922, independentOwner))).row.id,
  secondOpen.id,
);
assert.equal(
  (
    await pg.query(
      "select has_function_privilege('authenticated','public.create_measurement_request(jsonb)','execute') allowed",
    )
  ).rows[0].allowed,
  false,
);
console.log(
  "Two-open policy: active/scheduled slots, third rejection, cancellation release, retry, daily cap and service-only RPC passed.",
);
await pg.close();
