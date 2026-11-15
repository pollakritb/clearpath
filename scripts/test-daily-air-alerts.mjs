// Real PostgreSQL semantics in an isolated in-memory database. No provider I/O.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
const pg = new PGlite();
const read = (p) => readFileSync(p, "utf8");
const migration = (suffix) =>
  read(
    "supabase/migrations/" +
      readdirSync("supabase/migrations").find((x) =>
        x.endsWith(suffix + ".sql"),
      ),
  );
await pg.exec(read("backend/tests/fixtures/identifiers_baseline.sql"));
await pg.exec(migration("identifier_rollout_control"));
await pg.exec(
  "insert into community_xp_control(singleton,enabled,maintenance) values(true,false,false)",
);
const uid = "00000000-0000-0000-0000-000000000001";
await pg.query("insert into auth.users values($1)", [uid]);
await pg.query("insert into profiles(id) values($1)", [uid]);
await pg.exec(migration("readable_identifiers_expand"));
await pg.exec("update private.identifier_control set maintenance=true");
await pg.exec(migration("numeric_identifier_cutover"));
await pg.exec("update private.identifier_control set maintenance=false");
await pg.exec(migration("line_nearest_pin_notifications"));
await pg.exec(
  "insert into notification_preferences(user_id,consent_granted,line_enabled,radius_km,pm25_threshold,quiet_hours_start,quiet_hours_end) values(1,true,true,50,100,'22:00','07:00')",
);
await pg.exec(
  "insert into auth.users values('00000000-0000-0000-0000-000000000002')",
);
await pg.exec(
  "insert into profiles(auth_user_id,legacy_id) values('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002')",
);
const legacy = (
  await pg.query(
    "insert into user_notifications(user_id,event_type,title,body,url,payload,deduplication_key) values(2,'air_alert','old','old','/','{\"pm25\":80}','old-ack') returning id",
  )
).rows[0];
await pg.query(
  "insert into notification_outbox(user_id,notification_id,event_key,payload,status,processed_at) values(2,$1,'old-ack:line','{}','sent',now())",
  [legacy.id],
);
await pg.exec("begin");
await pg.exec(migration("fixed_daily_air_alerts"));
await pg.exec("commit");
assert.ok(
  (
    await pg.query(
      "select delivered_at from air_alert_daily_limits where user_id=2 and severity=2",
    )
  ).rows[0]?.delivered_at,
  "today's legacy acknowledged high alert is preserved",
);
const prefs = (
  await pg.query("select * from notification_preferences where user_id=1")
).rows[0];
assert.equal(prefs.radius_km, 2);
assert.equal(Number(prefs.pm25_threshold), 37.6);
assert.equal(prefs.quiet_hours_start, null);
assert.equal(prefs.quiet_hours_end, null);
assert.equal(prefs.air_alert_warning, true);
assert.equal(prefs.air_alert_danger, true);
await pg.exec(
  "update notification_preferences set radius_km=50,pm25_threshold=500,quiet_hours_start='21:00'",
);
assert.equal(
  (await pg.query("select radius_km from notification_preferences")).rows[0]
    .radius_km,
  2,
);
const today = (
  await pg.query(
    "select (now() at time zone 'Asia/Bangkok')::date::text as alert_day",
  )
).rows[0].alert_day;
const loc = (
  await pg.query("select set_air_alert_location(1,$1) r", [
    {
      lat: 14,
      lon: 100,
      accuracy_m: 20,
      observed_at: new Date().toISOString(),
    },
  ])
).rows[0].r;
await pg.exec(
  "insert into line_notification_links(user_id,line_user_id,active) values(1,'U11111111111111111111111111111111',true)",
);
const commit = async (
  severity,
  key,
  day = today,
  version = "nearest-pin-daily-v2",
  revisionOverride = null,
) => {
  const rev =
    (await pg.query("select revision from air_alert_states where user_id=1"))
      .rows[0]?.revision ?? 0;
  const at = (
    await pg.query(
      "select updated_at from notification_preferences where user_id=1",
    )
  ).rows[0].updated_at;
  return (
    await pg.query("select commit_air_alert(1,$1,$2,$3,$4,$5) ok", [
      loc.version,
      at,
      revisionOverride ?? rev,
      { alert_day: day, severity, _pending_key: key, _rollback: {} },
      {
        title: "local fixture",
        body: "local only",
        url: "/",
        deduplication_key: key,
        payload: {
          policy_version: version,
          pm25: severity === 2 ? 80 : 40,
          alert_day: day,
          alert_severity: severity,
        },
      },
    ])
  ).rows[0].ok;
};
assert.equal(await commit(1, "legacy", today, "nearest-pin-v1"), false);
assert.equal(await commit(1, "expired-day", "2000-01-01"), false);
await pg.exec("set role service_role");
assert.equal(await commit(1, "warning"), true);
assert.equal(
  await commit(2, "stale-revision", today, "nearest-pin-daily-v2", 0),
  false,
);
await pg.exec("reset role");
assert.equal(
  await commit(1, "duplicate-warning"),
  false,
  "same-day warning cannot repeat",
);
await pg.exec(
  "update air_alert_states set state='{}',revision=revision+1 where user_id=1",
);
assert.equal(
  await commit(1, "after-relink"),
  false,
  "relink/state reset cannot replenish quota",
);
assert.equal(
  await commit(2, "danger"),
  true,
  "escalation gets one separate slot",
);
assert.equal(await commit(2, "duplicate-danger"), false);
assert.equal(
  await commit(1, "downgrade"),
  false,
  "higher band suppresses later lower band",
);
assert.equal(
  (
    await pg.query(
      "select count(*)::int n from notification_outbox where user_id=1",
    )
  ).rows[0].n,
  2,
);
// A delivery acknowledgment is linked back to the durable day's reservation.
await pg.exec(
  "update notification_outbox set status='sent',processed_at=now() where event_key='danger:line'",
);
assert.ok(
  (
    await pg.query(
      "select delivered_at from air_alert_daily_limits where severity=2",
    )
  ).rows[0].delivered_at,
);
await pg.exec("select resolve_air_alert(1,'danger',true)");
assert.equal(
  (
    await pg.query(
      "select count(*)::int n from air_alert_daily_limits where user_id=1 and severity=2",
    )
  ).rows[0].n,
  1,
  "acknowledged quota survives rollback",
);
assert.equal(
  (
    await pg.query(
      "select state->>'_pending_key' key from air_alert_states where user_id=1",
    )
  ).rows[0].key,
  null,
  "cron fallback clears completed pending state too",
);
// A new calendar day is independent of old quota entries.
await pg.exec(
  "update air_alert_daily_limits set alert_date=alert_date-1 where user_id=1",
);
await pg.exec(
  "update air_alert_states set state='{}',revision=revision+1 where user_id=1",
);
assert.equal(await commit(2, "high-first"), true);
assert.equal(await commit(1, "low-after-high"), false);
await pg.exec("update notification_preferences set air_alert_warning=false");
await pg.exec(
  "update air_alert_daily_limits set alert_date=alert_date-2 where user_id=1",
);
await pg.exec(
  "update air_alert_states set state='{}',revision=revision+1 where user_id=1",
);
assert.equal(await commit(1, "disabled-warning"), false);
assert.equal(await commit(2, "danger-still-on"), true);
// An opted-out, never-attempted queue can release its unused reservation.
await pg.exec("select resolve_air_alert(1,'danger-still-on',true)");
assert.equal(
  (
    await pg.query(
      "select count(*)::int n from air_alert_daily_limits where user_id=1 and alert_date=$1",
      [today],
    )
  ).rows[0].n,
  0,
);
await pg.exec("set role anon");
await assert.rejects(pg.query("select * from air_alert_daily_limits"));
await assert.rejects(
  pg.query("select commit_air_alert(1,$1,$2,0,'{}',null)", [
    loc.version,
    prefs.updated_at,
  ]),
);
await pg.exec("set role authenticated");
await assert.rejects(pg.query("select * from air_alert_daily_limits"));
await pg.exec("reset role");
console.log(
  "Fixed settings, daily quotas, escalation, relink, day rollover, delivery acknowledgment, opt-out and access control passed",
);
await pg.close();
