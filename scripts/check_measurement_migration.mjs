// Isolated PostgreSQL validation; never connects to Supabase or production.
// Install the test runtime outside the repo, then pass its entrypoint:
// npm install --prefix /tmp/clearpath-sql-check @electric-sql/pglite
// node scripts/check_measurement_migration.mjs /tmp/clearpath-sql-check/node_modules/@electric-sql/pglite/dist/index.js
import { pathToFileURL } from "node:url";
const entry = process.argv[2];
if (!entry) throw new Error("Pass the isolated PGlite module entrypoint");
const { PGlite } = await import(pathToFileURL(entry).href);
import { readFileSync } from "node:fs";
const pg = new PGlite();
await pg.exec(`create role anon; create role authenticated; create role service_role;
create table profiles(id uuid primary key);
create table community_reports(id uuid primary key);
create table user_notifications(id uuid primary key,user_id uuid,event_type text,title text,body text,url text,entity_type text,entity_id text,payload jsonb,deduplication_key text,read_at timestamptz,created_at timestamptz,unique(user_id,deduplication_key));
create table notification_outbox(id uuid primary key,user_id uuid,notification_id uuid references user_notifications(id),event_key text unique,payload jsonb,status text,attempts int,next_attempt_at timestamptz,last_error text,processed_at timestamptz,created_at timestamptz,updated_at timestamptz);`);
await pg.exec(
  readFileSync(
    new URL(
      "../supabase/migrations/20261029004117_measurement_requests.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
const owner = "00000000-0000-0000-0000-000000000011";
const helper = "00000000-0000-0000-0000-000000000012";
const rid = "00000000-0000-0000-0000-000000000013";
await pg.query("insert into profiles values($1),($2)", [owner, helper]);
const now = new Date();
const end = new Date(now.getTime() + 3600000).toISOString();
const row = {
  id: rid,
  user_id: owner,
  idempotency_key: rid,
  fingerprint: "one",
  place_name: "A",
  lat: 13.8,
  lon: 100.1,
  radius_km: 3,
  starts_at: now.toISOString(),
  expires_at: end,
  status: "active",
  created_at: now.toISOString(),
  updated_at: now.toISOString(),
};
const create = await pg.query(
  "select create_measurement_request($1::jsonb) result",
  [JSON.stringify(row)],
);
if (create.rows[0].result.row.id !== rid) throw Error("create failed");
const again = await pg.query(
  "select create_measurement_request($1::jsonb) result",
  [JSON.stringify({ ...row, id: "00000000-0000-0000-0000-000000000099" })],
);
if (again.rows[0].result.row.id !== rid) throw Error("dedup failed");
await pg.query("select set_measurement_presence($1,$2::jsonb)", [
  helper,
  JSON.stringify({ enabled: true }),
]);
await pg.query("select set_measurement_presence($1,$2::jsonb)", [
  helper,
  JSON.stringify({
    lat: 13.8,
    lon: 100.1,
    accuracy_m: 10,
    observed_at: now.toISOString(),
  }),
]);
const nid = "00000000-0000-0000-0000-000000000014";
const oid = "00000000-0000-0000-0000-000000000015";
const notification = {
  id: nid,
  user_id: helper,
  event_type: "measurement_request",
  title: "help",
  body: "A",
  url: "/",
  entity_type: "measurement_request",
  entity_id: rid,
  payload: { matched_location_at: now.toISOString() },
  deduplication_key: "key",
  created_at: now.toISOString(),
};
const outbox = {
  id: oid,
  user_id: helper,
  notification_id: nid,
  event_key: "key:line",
  payload: {},
  status: "pending",
  attempts: 0,
  next_attempt_at: now.toISOString(),
  created_at: now.toISOString(),
  updated_at: now.toISOString(),
};
for (let i = 0; i < 2; i++)
  await pg.query("select notify_measurement_request($1::jsonb,$2::jsonb)", [
    JSON.stringify(notification),
    JSON.stringify(outbox),
  ]);
const count = await pg.query(
  "select (select count(*) from user_notifications) n,(select count(*) from notification_outbox) o",
);
if (count.rows[0].n !== 1 || count.rows[0].o !== 1)
  throw Error("notify dedup failed");
await pg.query("select finish_measurement_request($1,$2,null)", [
  rid,
  "cancelled",
]);
await pg.query("select set_measurement_presence($1,$2::jsonb)", [
  helper,
  JSON.stringify({ enabled: false }),
]);
const presence = await pg.query(
  "select lat,observed_at from measurement_helper_presence where user_id=$1",
  [helper],
);
if (presence.rows[0].lat !== null || presence.rows[0].observed_at !== null)
  throw Error("opt-out failed");
const policies = await pg.query(
  "select relname,relrowsecurity from pg_class where relname in ('measurement_requests','measurement_helper_presence','measurement_request_recipients','measurement_delivery_leases')",
);
if (policies.rows.some((r) => !r.relrowsecurity)) throw Error("RLS missing");
const grants = await pg.query(
  "select has_table_privilege('authenticated','measurement_requests','SELECT') allowed, has_function_privilege('authenticated','create_measurement_request(jsonb)','EXECUTE') executable",
);
if (grants.rows[0].allowed || grants.rows[0].executable)
  throw Error("Browser roles must not bypass API checks");
console.log(
  "PostgreSQL: migration, create, duplicate, presence, atomic notification/outbox, terminal update, opt-out and RLS passed",
);
await pg.close();
