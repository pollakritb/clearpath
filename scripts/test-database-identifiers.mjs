// Real Postgres rehearsal using the sanitized 44-table production schema.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
const pg = new PGlite();
await pg.exec(
  readFileSync(
    new URL(
      "../backend/tests/fixtures/identifiers_baseline.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
// Deliberately insert the newer row first, proving stable chronological backfill.
for (const [id, at] of [
  [uid(2), "2026-10-30"],
  [uid(1), "2026-10-29"],
]) {
  await pg.query("insert into auth.users values($1)", [id]);
  await pg.query("insert into profiles(id,created_at) values($1,$2)", [id, at]);
}
await pg.query(
  "insert into capture_sessions(id,user_id,issued_at,expires_at) values($1,$2,now(),now()+interval '5 minutes')",
  [uid(90), uid(1)],
);
await pg.query(
  "insert into community_reports(id,user_id,capture_session_id,display_name,lat,lon,pm25,status,created_at,captured_at) values($1,$2,$3,'dummy',14,100,20,'approved','2026-10-30','2026-10-30')",
  [uid(100), uid(1), uid(90)],
);
await pg.query(
  "insert into report_comments(id,report_id,user_id,body) values($1,$2,$3,'dummy')",
  [uid(110), uid(100), uid(2)],
);
await pg.query(
  "insert into community_xp_accounts(user_id,member_id) values($1,$2)",
  [uid(2), uid(200)],
);
await pg.query(
  "insert into community_xp_events(user_id,report_id,kind,points,reason,occurred_at) values($1,$2,'report',10,'granted',now())",
  [uid(1), uid(100)],
);
// An already disabled business trigger must remain disabled after migration.
await pg.exec(
  "alter table forecast_provider_snapshots disable trigger block_forecast_writes_during_reset",
);
const tables = (
  await pg.query(
    "select tablename from pg_tables where schemaname='public' order by tablename",
  )
).rows.map((r) => r.tablename);
assert.equal(tables.length, 44);
const before = {};
for (const table of tables)
  before[table] = (await pg.query(`select * from ${table} order by ctid`)).rows;
const migration = readdirSync(
  new URL("../supabase/migrations/", import.meta.url),
).find((x) => x.endsWith("_readable_identifiers_expand.sql"));
const sql = readFileSync(
  new URL(`../supabase/migrations/${migration}`, import.meta.url),
  "utf8",
);
await pg.exec("begin");
try {
  await pg.exec(sql);
  await pg.exec("commit");
} catch (e) {
  await pg.exec("rollback");
  throw e;
}
// Every original value, including timestamps, counters and JSON remains identical.
for (const table of tables) {
  const cols = Object.keys(before[table][0] ?? {});
  if (cols.length)
    assert.deepEqual(
      (
        await pg.query(`select ${cols.join(",")} from ${table} order by ctid`)
      ).rows.sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
      before[table].sort((a, b) =>
        JSON.stringify(a).localeCompare(JSON.stringify(b)),
      ),
      table,
    );
  else
    assert.equal(
      (await pg.query(`select count(*) n from ${table}`)).rows[0].n,
      0,
      table,
    );
}
assert.deepEqual(
  (await pg.query("select code,numeric_id from profiles order by numeric_id"))
    .rows,
  [
    { code: "USR-000001", numeric_id: 1 },
    { code: "USR-000002", numeric_id: 2 },
  ],
);
assert.equal(
  (await pg.query("select user_numeric_id from community_reports")).rows[0]
    .user_numeric_id,
  1,
);
assert.equal(
  (await pg.query("select report_numeric_id from report_comments")).rows[0]
    .report_numeric_id,
  1,
);
assert.equal(
  (
    await pg.query(
      "select tgenabled from pg_trigger where tgrelid='forecast_provider_snapshots'::regclass and tgname='block_forecast_writes_during_reset'",
    )
  ).rows[0].tgenabled,
  "D",
);
// Inserts and updates after expansion synchronize both forms and retain UUID aliases.
await pg.query(
  "insert into capture_sessions(id,user_id,issued_at,expires_at) values($1,$2,now(),now()+interval '5 minutes')",
  [uid(300), uid(1)],
);
assert.equal(
  (
    await pg.query(
      "select user_numeric_id from capture_sessions where id='" +
        uid(300) +
        "'",
    )
  ).rows[0].user_numeric_id,
  1,
);
await pg.query(
  "update capture_sessions set user_id=$1 where id='" + uid(300) + "'",
  [uid(2)],
);
assert.equal(
  (
    await pg.query(
      "select user_numeric_id from capture_sessions where id='" +
        uid(300) +
        "'",
    )
  ).rows[0].user_numeric_id,
  2,
);
assert.equal(
  (
    await pg.query(
      "select code from private.identifier_aliases where legacy_id=$1",
      [uid(300)],
    )
  ).rows[0].code,
  "CAP-000002",
);
// Old aliases survive deletion; reusing one for a different number must fail.
await pg.query("delete from capture_sessions where id=$1", [uid(300)]);
await assert.rejects(
  pg.query(
    "insert into capture_sessions(id,user_id,issued_at,expires_at) values($1,$2,now(),now()+interval '5 minutes')",
    [uid(300), uid(1)],
  ),
  /identifier_alias/,
);
// More than six digits must never be truncated.
await pg.exec(
  "select setval(pg_get_serial_sequence('public.capture_sessions','numeric_id'),1000000,false)",
);
await pg.query(
  "insert into capture_sessions(id,user_id,issued_at,expires_at) values($1,$2,now(),now()+interval '5 minutes')",
  [uid(301), uid(1)],
);
assert.equal(
  (
    await pg.query(
      "select code from capture_sessions where id='" + uid(301) + "'",
    )
  ).rows[0].code,
  "CAP-1000000",
);
// A directly supplied identity is rejected even for privileged clients.
await assert.rejects(
  pg.query(
    "insert into capture_sessions(id,numeric_id,user_id,issued_at,expires_at) values($1,5,$2,now(),now())",
    [uid(302), uid(1)],
  ),
  { code: "428C9" },
);
// Numeric FKs retain original cascade behavior (including deferred validation).
await pg.exec("begin");
await pg.query("delete from profiles where id=$1", [uid(2)]);
await pg.exec("commit");
assert.equal(
  (
    await pg.query(
      "select count(*) n from capture_sessions where user_id='" + uid(2) + "'",
    )
  ).rows[0].n,
  0,
);
// JSON write RPCs must omit newly generated columns and remain idempotent.
const now = new Date(),
  expiry = new Date(now.getTime() + 3600000);
const requestRow = {
  id: uid(400),
  user_id: uid(1),
  idempotency_key: uid(401),
  fingerprint: "dummy",
  place_name: "Dummy place",
  lat: 14,
  lon: 100,
  radius_km: 3,
  starts_at: now.toISOString(),
  expires_at: expiry.toISOString(),
  status: "active",
  result_report_id: null,
  dispatch_cursor: null,
  last_processed_at: null,
  created_at: now.toISOString(),
  updated_at: now.toISOString(),
};
const created = (
  await pg.query("select create_measurement_request($1) result", [
    JSON.stringify(requestRow),
  ])
).rows[0].result.row;
assert.equal(created.code, "REQ-000001");
const repeated = (
  await pg.query("select create_measurement_request($1) result", [
    JSON.stringify({ ...requestRow, id: uid(402) }),
  ])
).rows[0].result.row;
assert.equal(repeated.id, created.id);
await pg.query("select finish_measurement_request($1,'expired')", [created.id]);
const notice = {
  id: uid(500),
  user_id: uid(1),
  event_type: "measurement_expired",
  title: "dummy",
  body: "dummy",
  url: "/",
  entity_type: "measurement_request",
  entity_id: created.id,
  payload: {},
  deduplication_key: "dummy-notice",
  read_at: null,
  created_at: now.toISOString(),
};
const outbox = {
  id: uid(501),
  user_id: uid(1),
  notification_id: uid(500),
  event_key: "dummy-notice:line",
  payload: {},
  status: "pending",
  attempts: 0,
  next_attempt_at: now.toISOString(),
  last_error: null,
  processed_at: null,
  created_at: now.toISOString(),
  updated_at: now.toISOString(),
};
for (let i = 0; i < 2; i++)
  await pg.query("select notify_measurement_request($1,$2)", [
    JSON.stringify(notice),
    JSON.stringify(outbox),
  ]);
assert.equal(
  (await pg.query("select count(*) n from user_notifications")).rows[0].n,
  1,
);
assert.equal(
  (await pg.query("select count(*) n from notification_outbox")).rows[0].n,
  1,
);
assert.equal(
  (await pg.query("select notification_numeric_id from notification_outbox"))
    .rows[0].notification_numeric_id,
  1,
);
// Existing row-level ownership still restricts authenticated reads.
await pg.exec("set role authenticated");
await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [uid(1)]);
assert.equal(
  (await pg.query("select count(*) n from user_notifications")).rows[0].n,
  1,
);
await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [
  uid(999),
]);
assert.equal(
  (await pg.query("select count(*) n from user_notifications")).rows[0].n,
  0,
);
await pg.exec("reset role");
// Failed expansion leaves the pre-migration database intact when transaction rolls back.
const rollbackPg = new PGlite();
await rollbackPg.exec(
  readFileSync(
    new URL(
      "../backend/tests/fixtures/identifiers_baseline.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
await rollbackPg.exec("begin");
await rollbackPg.exec(sql);
await assert.rejects(rollbackPg.exec("select 1/0"), { code: "22012" });
await rollbackPg.exec("rollback");
assert.equal(
  (
    await rollbackPg.query(
      "select count(*) n from information_schema.columns where table_schema='public' and column_name='numeric_id'",
    )
  ).rows[0].n,
  0,
);
assert.equal(
  (
    await rollbackPg.query(
      "select count(*) n from pg_namespace where nspname='review'",
    )
  ).rows[0].n,
  0,
);
await rollbackPg.exec("alter table activities add column future_field text");
await rollbackPg.exec("begin");
await assert.rejects(rollbackPg.exec(sql), /identifier_schema_drift/);
await rollbackPg.exec("rollback");
assert.equal(
  (
    await rollbackPg.query(
      "select count(*) n from pg_namespace where nspname='review'",
    )
  ).rows[0].n,
  0,
);
await rollbackPg.close();
// Private review data cannot be accessed by public or authenticated clients.
for (const role of ["anon", "authenticated"]) {
  await pg.exec(`set role ${role}`);
  await assert.rejects(
    pg.query("select * from review.community_reports"),
    /permission denied/,
  );
  await assert.rejects(
    pg.query("select * from private.identifier_aliases"),
    /permission denied/,
  );
  await pg.exec("reset role");
}
assert.equal(
  (await pg.query("select count(*) n from pg_views where schemaname='review'"))
    .rows[0].n,
  44,
);
const reviewColumns = (
  await pg.query(
    "select column_name from information_schema.columns where table_schema='review'",
  )
).rows.map((r) => r.column_name);
for (const secret of [
  "auth_user_id",
  "exact_lat",
  "exact_lon",
  "image_path",
  "line_user_id",
  "idempotency_key",
  "member_numeric_id",
  "user_numeric_id",
])
  assert(!reviewColumns.includes(secret), secret);
console.log(
  "Identifier expansion: 44-table preservation, stable codes, FK synchronization, aliases, overflow, permissions and cascades passed.",
);
await pg.close();
