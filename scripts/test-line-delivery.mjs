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
  "insert into notification_preferences(user_id,consent_granted,line_enabled,updated_at) values(1,true,true,now())",
);
const point = {
  lat: 14,
  lon: 100,
  accuracy_m: 20,
  observed_at: new Date().toISOString(),
};
const loc = (await pg.query("select set_air_alert_location(1,$1) r", [point]))
  .rows[0].r;
const older = {
  ...point,
  lat: 15,
  observed_at: new Date(Date.now() - 60000).toISOString(),
};
assert.equal(
  (await pg.query("select set_air_alert_location(1,$1) r", [older])).rows[0].r
    .version,
  loc.version,
);
const preferences = (
  await pg.query(
    "select updated_at from notification_preferences where user_id=1",
  )
).rows[0].updated_at;
await pg.exec(
  "insert into line_notification_links(user_id,line_user_id,active) values(1,'U11111111111111111111111111111111',true)",
);
const notice = {
  title: "test",
  body: "test",
  url: "/",
  deduplication_key: "episode-1",
  payload: { pm25: 80 },
};
const commit = (rev) =>
  pg.query("select commit_air_alert(1,$1,$2,$3,$4,$5) ok", [
    loc.version,
    preferences,
    rev,
    { severity: 2 },
    notice,
  ]);
assert.equal((await commit(0)).rows[0].ok, true);
assert.equal(
  (await commit(0)).rows[0].ok,
  false,
  "stale CAS must not double enqueue",
);
assert.equal(
  (await pg.query("select count(*)::int n from notification_outbox")).rows[0].n,
  1,
);
const first = (await pg.query("select * from claim_line_outbox(1)")).rows;
assert.equal(first.length, 1);
assert.equal(
  (await pg.query("select * from claim_line_outbox(1)")).rows.length,
  0,
  "leased row unavailable",
);
await pg.query(
  "update notification_outbox set lease_until=now()-interval '1 second'",
);
const next = (await pg.query("select * from claim_line_outbox(1)")).rows[0];
assert.notEqual(next.lease_token, first[0].lease_token);
assert.equal(
  (
    await pg.query(
      "update notification_outbox set status='sent' where lease_token=$1 returning id",
      [first[0].lease_token],
    )
  ).rows.length,
  0,
  "old worker fenced",
);
const event = {
  webhookEventId: "e1",
  timestamp: Date.now(),
  type: "follow",
  source: { type: "user", userId: "U" + "1".repeat(32) },
};
assert.equal(
  (await pg.query("select accept_line_webhook($1) n", [[event]])).rows[0].n,
  1,
);
assert.equal(
  (await pg.query("select accept_line_webhook($1) n", [[event]])).rows[0].n,
  0,
);
assert.equal(
  (await pg.query("select * from claim_line_webhooks(10)")).rows.length,
  1,
);
assert.equal(
  (await pg.query("select * from claim_line_webhooks(10)")).rows.length,
  0,
);
assert.equal(
  (await pg.query("select reserve_line_budget('push',1,100) ok")).rows[0].ok,
  true,
);
assert.equal(
  (await pg.query("select reserve_line_budget('push',1,100) ok")).rows[0].ok,
  false,
);
await pg.exec("set role anon");
await assert.rejects(
  pg.query("select * from air_alert_locations"),
  /permission denied/,
);
await assert.rejects(
  pg.query("select claim_line_outbox(1)"),
  /permission denied/,
);
await pg.exec("reset role");

await pg.exec(
  "insert into capture_sessions(user_id,issued_at,expires_at) values(1,now(),now()+interval '5 minutes')",
);
await pg.exec(
  "insert into community_reports(user_id,capture_session_id,lat,lon,public_lat,public_lon,pm25,status,captured_at) values(1,1,15,101,14.001,100,20,'approved',now())",
);
await pg.exec(
  "insert into stations(id,name_th,lat,lon,pm25,recorded_at) values('high','far station',14.01,100,80,now())",
);
const nearest = (
  await pg.query("select air_alert_candidates(14,100,10) sources")
).rows[0].sources;
assert.equal(nearest.length, 1);
assert.equal(nearest[0].source_type, "community");
assert.equal(
  nearest[0].pm25,
  20,
  "near low report wins before checking high threshold",
);
assert.equal(
  nearest[0].lat,
  14.001,
  "only public report coordinates may participate",
);
assert(nearest[0].distance_km > 0.11 && nearest[0].distance_km < 0.12);
await pg.exec("update community_reports set status='rejected'");
assert.equal(
  (await pg.query("select air_alert_candidates(14,100,10) sources")).rows[0]
    .sources[0].source_type,
  "station",
);
// Stale workers cannot resolve episode state or finalize a recovered lease.
assert.equal(
  (
    await pg.query("select finish_line_outbox($1,$2,$3) ok", [
      next.id,
      first[0].lease_token,
      { status: "sent" },
    ])
  ).rows[0].ok,
  false,
);
assert.equal(
  (
    await pg.query("select finish_line_outbox($1,$2,$3) ok", [
      next.id,
      next.lease_token,
      { status: "failed", last_error: "line_network_error" },
    ])
  ).rows[0].ok,
  true,
);
await pg.exec(
  "update line_notification_links set link_code_hash='hash-one',link_code_expires_at=now()+interval '10 minutes' where user_id=1",
);
let inbox = (
  await pg.query("select * from line_webhook_inbox where event_id='e1'")
).rows[0];
await pg.query("select apply_line_webhook($1,$2,null)", [
  inbox.event_id,
  inbox.lease_token,
]);
await pg.exec(
  "update line_webhook_inbox set status='done' where event_id='e1'",
);
const linkEvent = {
  ...event,
  webhookEventId: "link",
  timestamp: Date.now() + 1,
  type: "message",
  message: { type: "text", text: "CP-ABCD2345" },
};
await pg.query("select accept_line_webhook($1)", [[linkEvent]]);
inbox = (await pg.query("select * from claim_line_webhooks(1)")).rows[0];
const reply = (
  await pg.query("select apply_line_webhook($1,$2,'hash-one') reply", [
    inbox.event_id,
    inbox.lease_token,
  ])
).rows[0].reply;
assert.match(reply, /สำเร็จ/);
assert.equal(
  (
    await pg.query("select apply_line_webhook($1,$2,'hash-one') reply", [
      inbox.event_id,
      inbox.lease_token,
    ])
  ).rows[0].reply,
  reply,
  "link retry retains the committed outcome after code consumption",
);
await pg.query(
  "update line_webhook_inbox set status='done' where event_id=$1",
  [inbox.event_id],
);
await pg.query("select accept_line_webhook($1)", [
  [
    {
      ...event,
      webhookEventId: "old-unfollow",
      timestamp: Date.now() - 60000,
      type: "unfollow",
    },
  ],
]);
inbox = (await pg.query("select * from claim_line_webhooks(1)")).rows[0];
await pg.query("select apply_line_webhook($1,$2,null)", [
  inbox.event_id,
  inbox.lease_token,
]);
assert.equal(
  (await pg.query("select active from line_notification_links where user_id=1"))
    .rows[0].active,
  true,
  "old redelivery cannot overwrite the new link",
);
await pg.query(
  "update line_webhook_inbox set status='done' where event_id=$1",
  [inbox.event_id],
);
await pg.query("select accept_line_webhook($1)", [
  [
    {
      ...event,
      webhookEventId: "new-unfollow",
      timestamp: Date.now() + 10,
      type: "unfollow",
    },
  ],
]);
inbox = (await pg.query("select * from claim_line_webhooks(1)")).rows[0];
await pg.query("select apply_line_webhook($1,$2,null)", [
  inbox.event_id,
  inbox.lease_token,
]);
assert.equal(
  (await pg.query("select active from line_notification_links where user_id=1"))
    .rows[0].active,
  false,
);
// Claiming evaluations is bounded and recovers after a lease timeout.
await pg.exec(
  "update air_alert_states set evaluated_at='epoch',evaluation_lease_until=null",
);
assert.equal(
  (await pg.query("select * from due_air_alert_users(1)")).rows.length,
  1,
);
assert.equal(
  (await pg.query("select * from due_air_alert_users(1)")).rows.length,
  0,
);
await pg.exec("select prune_line_delivery_data()");

// In-app-only or unlinked recipients must not retain an unresolvable pending key.
const latestPrefs = (
  await pg.query(
    "select updated_at from notification_preferences where user_id=1",
  )
).rows[0].updated_at;
const revision = (
  await pg.query("select revision from air_alert_states where user_id=1")
).rows[0].revision;
assert.equal(
  (
    await pg.query("select commit_air_alert(1,$1,$2,$3,$4,$5) ok", [
      loc.version,
      latestPrefs,
      revision,
      { severity: 2, _pending_key: "unlinked", _rollback: {} },
      { ...notice, deduplication_key: "unlinked" },
    ])
  ).rows[0].ok,
  true,
);
assert.equal(
  (
    await pg.query(
      "select state ? '_pending_key' pending from air_alert_states where user_id=1",
    )
  ).rows[0].pending,
  false,
);
assert.equal(
  (
    await pg.query(
      "select count(*)::int n from notification_outbox where event_key='unlinked:line'",
    )
  ).rows[0].n,
  0,
);
console.log(
  "LINE migration: location CAS, atomic episode/outbox, lease recovery/fencing, durable webhook dedup and shared budget/RLS passed",
);
await pg.close();
