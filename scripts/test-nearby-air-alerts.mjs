// Isolated PostgreSQL rehearsal only; never contacts Supabase or LINE.
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
await pg.exec(migration("fixed_daily_air_alerts"));
await pg.exec(migration("nearby_air_alerts"));
const locations = new Map();
for (const n of [1, 2]) {
  await pg.query(
    "insert into notification_preferences(user_id,consent_granted,line_enabled) values($1,true,true)",
    [n],
  );
  await pg.query(
    "insert into line_notification_links(user_id,line_user_id,active) values($1,$2,true)",
    [n, "U" + String(n).repeat(32)],
  );
  locations.set(
    n,
    (
      await pg.query("select set_air_alert_location($1,$2) r", [
        n,
        {
          lat: 14,
          lon: 100,
          accuracy_m: 10,
          observed_at: new Date().toISOString(),
        },
      ])
    ).rows[0].r,
  );
}
await pg.exec(`insert into stations(id,lat,lon,pm25,recorded_at) values
 ('nearest-low',14.0001,100,10,now()-interval '5 minutes'),
 ('warning',14.001,100,50,now()-interval '5 minutes'),
 ('danger',14.01,100,80,now()-interval '5 minutes'),
 ('outside',14.03,100,100,now()),
 ('expired',14.002,100,90,now()-interval '2 hours');`);
for (const n of [1, 2]) {
  await pg.query(
    "insert into capture_sessions(user_id,issued_at,expires_at) values($1,now(),now()+interval '5 minutes')",
    [n],
  );
  await pg.query(
    "insert into community_reports(user_id,capture_session_id,lat,lon,public_lat,public_lon,pm25,status,captured_at) values($1,$1,14,100,14.002,100,55,'approved',now())",
    [n],
  );
}
const prefs = async (user) =>
  (
    await pg.query("select * from notification_preferences where user_id=$1", [
      user,
    ])
  ).rows[0];
const sources = async (user) =>
  (
    await pg.query(
      "select air_alert_candidates_for_user($1,14::float8,100::float8,2::float8) r",
      [user],
    )
  ).rows[0].r;
const notices = async (user) =>
  (await sources(user))
    .filter((s) => s.pm25 >= 37.6)
    .map((s) => ({
      title: "local fixture",
      body: "local only",
      url: "/",
      deduplication_key: `observation:${s.source_type}:${s.source_id}:${s.source_at}:${s.pm25}:${user}`,
      payload: {
        ...s,
        policy_version: "nearby-pin-observation-v3",
        alert_severity: s.pm25 > 75 ? 2 : 1,
        location_version: locations.get(user).version,
      },
    }));
const commit = async (
  user,
  batch,
  version = locations.get(user).version,
  at = null,
) =>
  (
    await pg.query("select commit_nearby_air_alerts($1,$2,$3,$4) n", [
      user,
      version,
      at ?? (await prefs(user)).updated_at,
      batch,
    ])
  ).rows[0].n;
const count = async (table) =>
  Number((await pg.query(`select count(*) n from ${table}`)).rows[0].n);
assert.equal(
  (await sources(1)).length,
  4,
  "include all nearby pins; exclude stale, outside and own report",
);
const first = await notices(1);
assert.equal(first.length, 3);
await pg.exec(
  "insert into air_alert_daily_limits(user_id,alert_date,severity,deduplication_key) values(1,current_date,2,'historical-limit')",
);
await pg.exec("set role service_role");
assert.equal(
  await commit(1, first),
  3,
  "previous daily quota must not suppress any pin",
);
assert.equal(
  await commit(1, first),
  0,
  "retry must not duplicate notices or deliveries",
);
assert.equal(
  await commit(2, await notices(2)),
  3,
  "each recipient gets independent delivery keys",
);
assert.equal(await count("notification_outbox"), 6);
await pg.exec(
  "update stations set recorded_at=now(),pm25=45 where id in ('warning','danger')",
);
assert.equal(
  await commit(1, await notices(1)),
  2,
  "same-band update and lower-band update both notify",
);
for (let i = 0; i < 20; i++)
  await pg.query(
    "insert into stations(id,lat,lon,pm25,recorded_at) values($1,14.002,100,50,now())",
    ["many-" + i],
  );
const batch = await notices(1);
assert.equal(await commit(1, batch), 20, "no daily or pending-message cap");
await pg.exec("delete from air_alert_states where user_id=1");
assert.equal(
  await commit(1, batch),
  0,
  "state reset cannot resend observations",
);
assert.equal(
  await commit(1, batch, "00000000-0000-0000-0000-000000000000"),
  0,
  "stale GPS version fails closed",
);
assert.equal(
  await commit(1, batch, undefined, "2000-01-01T00:00:00Z"),
  0,
  "stale preferences fail closed",
);
const before = await count("user_notifications");
assert.equal(
  await commit(1, [
    {
      ...first[0],
      deduplication_key: "old",
      payload: { ...first[0].payload, policy_version: "nearest-pin-daily-v2" },
    },
  ]),
  0,
);
assert.equal(
  await commit(1, [
    {
      ...first[0],
      deduplication_key: "wrong-pin",
      payload: {
        ...first[0].payload,
        source_id: "outside",
        pm25: 100,
        alert_severity: 2,
      },
    },
  ]),
  0,
);
assert.equal(await count("user_notifications"), before);
await pg.exec(
  "update notification_preferences set air_alert_warning=false where user_id=1",
);
await pg.exec(
  "insert into stations(id,lat,lon,pm25,recorded_at) values('opted-out',14.002,100,50,now())",
);
assert.equal(
  await commit(1, await notices(1)),
  0,
  "band opt-outs remain effective",
);
await pg.exec(
  "update notification_outbox set status='sent',processed_at=now() where user_id=1",
);
assert.equal(
  await count("air_alert_daily_limits"),
  1,
  "new deliveries do not write daily quota audit",
);
assert.equal(
  (
    await pg.query("select commit_air_alert(1,$1,$2,0,'{}','{}') ok", [
      locations.get(1).version,
      (await prefs(1)).updated_at,
    ])
  ).rows[0].ok,
  false,
  "old writers cannot enqueue retired policy",
);
await pg.exec(
  "insert into stations(id,lat,lon,pm25,recorded_at) values('rollback-a',14.002,100,80,now()),('rollback-b',14.002,100,80,now())",
);
const fresh = (await notices(1)).filter((n) =>
  n.payload.source_id.startsWith("rollback-"),
);
const saved = await count("user_notifications");
await assert.rejects(commit(1, [fresh[0], { ...fresh[1], title: null }]));
assert.equal(
  await count("user_notifications"),
  saved,
  "one invalid item rolls back the whole batch",
);
assert.equal(
  (await Promise.all(Array.from({ length: 4 }, () => commit(1, fresh)))).reduce(
    (a, b) => a + b,
    0,
  ),
  2,
  "concurrent retries cannot duplicate batch observations",
);
const allowedAt = (await prefs(1)).updated_at;
for (const role of ["anon", "authenticated"]) {
  await pg.exec(`set role ${role}`);
  await assert.rejects(
    pg.query("select commit_nearby_air_alerts(1,$1,$2,$3)", [
      locations.get(1).version,
      allowedAt,
      first,
    ]),
    /permission denied for function commit_nearby_air_alerts/,
  );
}
await pg.exec("reset role");
await pg.close();
console.log(
  "PASS: all nearby pins, uncapped observations, recipient-scoped deduplication, retries, state resets, bands, freshness, CAS, delivery audit and RPC permissions",
);
