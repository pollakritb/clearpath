import { PGlite } from "@electric-sql/pglite";
import { readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const pg = new PGlite();
await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create table profiles(id uuid primary key);
create table measurement_requests(id uuid primary key,user_id uuid,status text,starts_at timestamptz,expires_at timestamptz,updated_at timestamptz,lat float8,lon float8,radius_km int);
create table measurement_request_recipients(request_id uuid,user_id uuid,declined boolean default false);
create table community_reports(id uuid primary key,user_id uuid,status text,moderated_at timestamptz,created_at timestamptz,captured_at timestamptz,lat float8,lon float8,capture_source text,duplicate_of_report_id uuid);
create table report_evidence(report_id uuid primary key,image_metadata jsonb);
create table report_drafts(id uuid);create table capture_sessions(id uuid);
`);
await pg.exec(
  readFileSync(
    new URL(
      "../supabase/migrations/20261030213750_community_xp.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
const uid = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
for (const n of [1, 2, 3, 4])
  await pg.query("insert into profiles values($1)", [uid(n)]);
await pg.exec("update community_xp_control set enabled=true");
let n = 100;
const now = new Date();
const thaiMidnight = new Date(
  new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10) +
    "T00:00:00+07:00",
);
const report = async (user, minutes = 0, request = null, options = {}) => {
  const id = uid(n++),
    at = new Date(
      (user === 2 || user === 5 ? thaiMidnight : now).getTime() +
        minutes * 60000,
    ).toISOString();
  await pg.query(
    `insert into community_reports values($1,$2,'pending',null,$3,$3,14,100,'camera',null)`,
    [id, uid(user), at],
  );
  await pg.query("insert into report_evidence values($1,$2)", [
    id,
    JSON.stringify({
      measurement_request_id: request,
      bonus_gps_at_submission: { lat: 14, lon: 100, accuracy_m: 10 },
      ...options,
    }),
  ]);
  await pg.query(
    "update community_reports set status='approved',moderated_at=$2 where id=$1",
    [id, at],
  );
  return id;
};
const processJobs = () => pg.query("select process_community_xp(50)");
const total = async (user) =>
  (
    await pg.query("select * from community_xp_totals() where user_id=$1", [
      uid(user),
    ])
  ).rows[0];
const a = await report(2);
await processJobs();
assert.equal((await total(2)).lifetime_xp, 10);
await processJobs();
assert.equal((await total(2)).lifetime_xp, 10, "idempotent retry");
await report(2, 10);
await processJobs();
assert.equal((await total(2)).lifetime_xp, 10, "cooldown");
for (const min of [30, 60, 90, 120, 150]) {
  await report(2, min);
  await processJobs();
}
assert.equal((await total(2)).lifetime_xp, 50, "daily report cap");
// New helpers claim before capture, first fulfilment does not steal existing claims.
const req = uid(50);
await pg.query(
  "insert into measurement_requests values($1,$2,'active',now()-interval '1 hour',now()+interval '2 hours',now(),14,100,3)",
  [req, uid(1)],
);
for (const user of [3, 4]) {
  await pg.query(
    "insert into measurement_request_recipients values($1,$2,false)",
    [req, uid(user)],
  );
  await pg.query("select claim_community_help($1,$2)", [uid(user), req]);
}
await pg.query(
  "update community_help_claims set started_at=now()-interval '2 minutes'",
);
await report(3, 1, req);
await processJobs();
assert.equal((await total(3)).lifetime_xp, 15, "report plus help = 15");
await pg.query(
  "update measurement_requests set status='fulfilled',updated_at=now() where id=$1",
  [req],
);
await report(4, 2, req);
await processJobs();
assert.equal((await total(4)).lifetime_xp, 15, "second helper grace");
await pg.query(
  "insert into measurement_request_recipients values($1,$2,false)",
  [req, uid(2)],
);
await assert.rejects(
  () => pg.query("select claim_community_help($1,$2)", [uid(2), req]),
  "no new claims after fulfilment",
);
const ev = (
  await pg.query(
    "select id from community_xp_events where report_id=$1 and kind='report'",
    [a],
  )
).rows[0].id;
await pg.query("select reverse_community_xp($1,$2)", [
  ev,
  "confirmed duplicate abuse",
]);
assert.equal((await total(2)).lifetime_xp, 40, "reversal recomputes totals");
await pg.query("select reverse_community_xp($1,$2)", [
  ev,
  "confirmed duplicate abuse",
]);
assert.equal((await total(2)).lifetime_xp, 40, "reversal idempotent");
let board = (
  await pg.query("select community_xp_board('all',0,$1) result", [uid(3)])
).rows[0].result;
assert.equal(board.rows[1].rank, 2);
assert.equal(board.rows[2].rank, 2, "competition ties");
assert(!JSON.stringify(board).includes("user_id"), "no auth id on board");
await pg.query(
  "update community_xp_accounts set hidden=true where user_id=$1",
  [uid(2)],
);
board = (
  await pg.query("select community_xp_board('all',0,$1) result", [uid(2)])
).rows[0].result;
assert.equal(board.me, null);
assert.equal(board.rows.length, 2);
// Three +5 bonuses and five +10 reports can earn at most 65 XP.
await pg.query("insert into profiles values($1)", [uid(5)]);
for (let i = 0; i < 4; i++) {
  const rid = uid(60 + i);
  await pg.query(
    "insert into measurement_requests values($1,$2,'active',$3,now()+interval '4 hours',now(),14,100,3)",
    [rid, uid(i + 1), new Date(thaiMidnight.getTime() - 3600000).toISOString()],
  );
  await pg.query(
    "insert into measurement_request_recipients values($1,$2,false)",
    [rid, uid(5)],
  );
  await pg.query("select claim_community_help($1,$2)", [uid(5), rid]);
  await pg.query(
    "update community_help_claims set started_at=$2 where request_id=$1",
    [rid, new Date(thaiMidnight.getTime() - 60000).toISOString()],
  );
  await report(5, i * 30, rid);
  await processJobs();
}
await report(5, 120);
await processJobs();
await report(5, 150);
await processJobs();
assert.equal((await total(5)).lifetime_xp, 65, "daily maximum is 65");
assert.equal((await total(5)).today_help, 3, "bonus cap is three");
assert.equal((await total(5)).today_reports, 5, "base cap is five");
await pg.exec("set role anon");
await assert.rejects(() => pg.query("select * from community_xp_events"));
await assert.rejects(() => pg.query("select process_community_xp(1)"));
await pg.exec("reset role");
console.log(
  "XP SQL: approval outbox, retries, quotas, cooldown, multiple helpers, grace, reversal, ties, privacy and role isolation passed",
);
// Exercise the reset SQL and restore a real relational snapshot locally.
await pg.exec(`alter table profiles add column reputation_score int default 0, add column approved_reports int default 0, add column helpful_reviews int default 0;
create table report_reviews(id uuid);create table report_reactions(id uuid);create table report_comments(id uuid);
create table reputation_events(id uuid);
create table community_forecast_feature_snapshots(id uuid);create table public_map_events(id uuid);
create table measurement_delivery_leases(id uuid);create table user_notifications(id uuid,entity_type text,event_type text);
create table notification_outbox(id uuid,notification_id uuid,payload jsonb);create table audit_logs(id uuid,entity_type text);
create table measurement_helper_presence(user_id uuid primary key,enabled boolean,lat float8,lon float8,accuracy_m float8,observed_at timestamptz);`);
await pg.query(
  "insert into measurement_helper_presence values($1,true,14,100,10,now())",
  [uid(3)],
);
await pg.exec(
  "update profiles set reputation_score=99,approved_reports=8,helpful_reviews=2",
);
const py = (source, input) =>
  execFileSync(
    process.env.CLEARPATH_TEST_PYTHON ??
      (existsSync(".venv/bin/python") ? ".venv/bin/python" : "python3"),
    ["-c", source],
    { encoding: "utf8", input },
  );
const snapshotSQL = py(
  "from scripts.community_reset_sql import snapshot_sql;print(snapshot_sql())",
);
const before = (await pg.query(snapshotSQL)).rows[0].snapshot;
const manifest = { sha256: "b".repeat(64), fingerprints: before.fingerprints };
const resetSQL = py(
  "import sys,json;from scripts.community_reset_sql import reset_sql;print(reset_sql(json.load(sys.stdin)))",
  JSON.stringify(manifest),
);
await pg.exec("update community_xp_control set maintenance=true");
await assert.rejects(() => report(3, 10), "maintenance freezes publication");
await pg.exec(resetSQL);
assert.equal(
  (await pg.query("select count(*) n from community_reports")).rows[0].n,
  0,
);
assert.equal(
  (await pg.query("select sum(reputation_score) n from profiles")).rows[0].n,
  0,
);
let presence = (await pg.query("select * from measurement_helper_presence"))
  .rows[0];
assert(
  presence.enabled && presence.lat === null && presence.observed_at === null,
  "keep helper consent, erase old GPS",
);
await pg.exec(resetSQL); // exact manifest replay cannot delete future data.
assert.equal(
  (await pg.query("select count(*) n from profiles")).rows[0].n,
  5,
  "accounts preserved",
);
await pg.exec(
  "begin;set local clearpath.community_reset='approved';update community_xp_control set enabled=false;",
);
for (const table of [
  "community_reports",
  "report_evidence",
  "measurement_requests",
  "measurement_request_recipients",
  "community_xp_accounts",
  "community_help_claims",
  "community_xp_jobs",
  "community_xp_events",
]) {
  if (before.tables[table].length)
    await pg.query(
      `insert into ${table} select * from jsonb_populate_recordset(null::${table},$1)`,
      [JSON.stringify(before.tables[table])],
    );
}
await pg.exec("commit");
assert.equal(
  (await total(3)).lifetime_xp,
  15,
  "snapshot restore preserves XP ledger",
);
console.log(
  "XP reset: guarded snapshot, maintenance, idempotent reset, account/consent preservation and relational restore passed",
);
await pg.close();
