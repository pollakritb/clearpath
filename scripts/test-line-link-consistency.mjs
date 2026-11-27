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

await pg.exec(migration("line_link_consistency"));
await pg.exec("set role service_role");
const uid = "U" + "1".repeat(32);
const issue = async (owner, key) =>
  pg.query("select issue_line_link_code($1,$2,now()+interval '10 minutes')", [
    owner,
    key,
  ]);
const link = async (key, line = uid) =>
  (await pg.query("select complete_line_link($1,$2) ok", [key, line])).rows[0]
    .ok;
const reset = async (owner) =>
  (await pg.query("select reset_line_notification_link($1) ok", [owner]))
    .rows[0].ok;
const row = async (owner) =>
  (
    await pg.query("select * from line_notification_links where user_id=$1", [
      owner,
    ])
  ).rows[0];
await issue(1, "initial");
assert.equal(await link("initial"), true);
await issue(1, "replacement");
assert.equal(
  (await row(1)).active,
  true,
  "issuing a code must not reset active to defaults",
);
assert.equal((await row(1)).line_user_id, uid);
await pg.exec(
  "insert into user_notifications(user_id,event_type,title,body,deduplication_key) values(1,'air_alert','test','test','test-reset')",
);
await pg.exec(
  "insert into notification_outbox(user_id,notification_id,event_key,payload) select 1,id,'test-reset:line','{\"channel\":\"line\"}'::jsonb from user_notifications where deduplication_key='test-reset'",
);
assert.equal(await reset(1), true);
assert.equal(await row(1), undefined);
assert.equal(
  await link("replacement"),
  false,
  "cancelled codes must not re-link",
);
assert.equal(
  (
    await pg.query(
      "select status from notification_outbox where event_key='test-reset:line'",
    )
  ).rows[0].status,
  "dead",
);
assert.equal(
  (
    await pg.query(
      "select line_enabled from notification_preferences where user_id=1",
    )
  ).rows[0].line_enabled,
  false,
);
assert.equal(
  (
    await pg.query(
      "select count(*)::int n from user_notifications where user_id=1",
    )
  ).rows[0].n,
  1,
  "reset preserves notification history",
);
assert.equal(await reset(1), false, "reset is idempotent");
await issue(1, "new");
assert.equal(await link("new"), true);
assert.equal(await link("new"), false, "code is one time only");
await issue(2, "second");
assert.equal(
  await link("second"),
  false,
  "cannot take an active account's LINE",
);
await pg.exec(
  "update line_notification_links set active=false where user_id=1",
);
assert.equal(
  await link("second"),
  true,
  "inactive historical association must release unique LINE identity",
);
assert.equal((await row(1)).line_user_id, null);
await issue(1, "old-code");
await issue(1, "new-code");
assert.equal(await link("old-code", "U" + "2".repeat(32)), false);
assert.equal(await link("new-code", "U" + "2".repeat(32)), true);
await issue(1, "via-webhook");
await pg.query("select accept_line_webhook($1)", [
  [
    {
      webhookEventId: "link-test",
      timestamp: Date.now(),
      type: "message",
      source: { type: "user", userId: "U" + "2".repeat(32) },
      message: { type: "text", text: "CP-TEST" },
    },
  ],
]);
const leased = (await pg.query("select * from claim_line_webhooks(10)"))
  .rows[0];
const reply = (
  await pg.query("select apply_line_webhook($1,$2,$3) r", [
    leased.event_id,
    leased.lease_token,
    "via-webhook",
  ])
).rows[0].r;
assert.match(reply, /สำเร็จ/);
await reset(1);
assert.equal(await link("via-webhook", "U" + "2".repeat(32)), false);
for (const role of ["anon", "authenticated"]) {
  await pg.exec(`set role ${role}`);
  await assert.rejects(
    pg.query("select reset_line_notification_link(1)"),
    /permission denied/,
  );
  await assert.rejects(
    pg.query("select issue_line_link_code(1,'bad',now())"),
    /permission denied/,
  );
  await assert.rejects(
    pg.query("select complete_line_link('bad','bad')"),
    /permission denied/,
  );
}
await pg.close();
console.log(
  "PASS: active link preservation, reset/relink, one-time revocation, inactive identity reuse, webhook atomic linking, pending delivery cancellation and RPC permissions",
);
