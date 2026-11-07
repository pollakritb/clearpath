import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const pg = new PGlite();
await pg.exec(
  "create role anon; create role authenticated; create role service_role bypassrls;",
);
await pg.exec(
  readFileSync(
    new URL(
      "../supabase/migrations/20261107041221_scheduled_external_feeds.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
const query = async (sql, args = []) => (await pg.query(sql, args)).rows;
const rpc = async (sql, args) => (await query(sql, args))[0].result;
const claim = (source, token) =>
  rpc("select claim_external_feed($1,$2) result", [source, token]);
const finish = (source, token, payload) =>
  rpc("select finish_external_feed($1,$2,$3) result", [
    source,
    token,
    JSON.stringify(payload),
  ]);
const a = "00000000-0000-0000-0000-000000000001";
const b = "00000000-0000-0000-0000-000000000002";
const c = "00000000-0000-0000-0000-000000000003";
const d = "00000000-0000-0000-0000-000000000004";
const item = {
  id: "google-news-1",
  guid: "1",
  title: "PM2.5 update",
  source_name: "News",
  source_url: "https://example.com/1",
  published_at: new Date().toISOString(),
};
assert.equal((await claim("google_news", a)).status, "claimed");
assert.equal((await claim("google_news", b)).status, "in_progress");
assert.equal(
  (await finish("google_news", b, { ok: true, items: [] })).status,
  "lease_lost",
);
let result = await finish("google_news", a, {
  ok: true,
  items: [item],
  validators: { etag: "one" },
});
assert.equal(result.inserted, 1);
assert.equal((await claim("google_news", b)).status, "not_due");
await pg.exec(
  "update external_feed_sources set next_attempt_at=now()-interval '1 second'",
);
assert.equal((await claim("google_news", b)).validators.etag, "one");
result = await finish("google_news", b, {
  ok: true,
  items: [item, { ...item, id: "other", guid: "other" }],
});
assert.equal(result.duplicates, 2); // Same URL under a new GUID must not duplicate.
assert.equal((await query("select * from external_news_items")).length, 1);
const first = (
  await query("select first_seen_at,updated_at from external_news_items")
)[0];
await pg.exec(
  "update external_feed_sources set next_attempt_at=now()-interval '1 second'",
);
await claim("google_news", c);
result = await finish("google_news", c, {
  ok: true,
  items: [{ ...item, title: "PM2.5 revised" }],
});
assert.equal(result.updated, 1);
assert.equal(
  (
    await query("select first_seen_at from external_news_items")
  )[0].first_seen_at.getTime(),
  first.first_seen_at.getTime(),
);
await pg.exec(
  "update external_feed_sources set next_attempt_at=now()-interval '1 second'",
);
await claim("google_news", d);
await finish("google_news", d, { ok: false, error_code: "TimeoutException" });
let state = (
  await query("select * from external_feed_sources where source='google_news'")
)[0];
assert.equal(state.validators.etag, "one");
assert.equal(
  (await query("select title from external_news_items"))[0].title,
  "PM2.5 revised",
);
assert.equal(state.failures, 1);
assert(
  Math.abs(
    state.next_attempt_at.getTime() -
      (Math.floor(Date.now() / 300000) * 300000 + 300000),
  ) < 5000,
);
await pg.exec(
  "update external_feed_sources set next_attempt_at=now()-interval '1 second'",
);
const e = "00000000-0000-0000-0000-000000000005";
await claim("google_news", e);
await finish("google_news", e, { ok: false, error_code: "TimeoutException" });
state = (
  await query("select * from external_feed_sources where source='google_news'")
)[0];
assert(
  Math.abs(
    state.next_attempt_at.getTime() -
      (Math.floor(Date.now() / 300000) * 300000 + 900000),
  ) < 5000,
);
// 304 is a successful check and retains both items and validators.
await pg.exec(
  "update external_feed_sources set next_attempt_at=now()-interval '1 second'",
);
const f = "00000000-0000-0000-0000-000000000006";
await claim("google_news", f);
await finish("google_news", f, { ok: true, not_modified: true });
assert.equal((await query("select * from external_news_items")).length, 1);
assert.equal(
  (
    await query(
      "select failures from external_feed_sources where source='google_news'",
    )
  )[0].failures,
  0,
);
// Snapshot is durable and is not overwritten by a failed fetch.
const g = "00000000-0000-0000-0000-000000000007";
await claim("nasa_firms", g);
await finish("nasa_firms", g, {
  ok: true,
  snapshot: { fires: [{ lat: 18.78, lon: 98.98 }], stale_count: 0 },
});
await pg.exec(
  "update external_feed_sources set next_attempt_at=now()-interval '1 second' where source='nasa_firms'",
);
const h = "00000000-0000-0000-0000-000000000008";
await claim("nasa_firms", h);
await finish("nasa_firms", h, { ok: false, error_code: "UpstreamError" });
assert.equal(
  (
    await query(
      "select snapshot from external_feed_sources where source='nasa_firms'",
    )
  )[0].snapshot.fires.length,
  1,
);
assert.equal((await rpc("select list_external_news(10) result", [])).length, 1);
// Entire publication rolls back on malformed data.
await pg.exec(
  "update external_feed_sources set next_attempt_at=now()-interval '1 second'",
);
const i = "00000000-0000-0000-0000-000000000009";
await claim("google_news", i);
await assert.rejects(
  finish("google_news", i, {
    ok: true,
    items: [
      { ...item, id: "new", guid: "new", source_url: "https://example.com/2" },
      { ...item, id: "bad", guid: "bad", source_url: "javascript:bad" },
    ],
  }),
);
assert.equal((await query("select * from external_news_items")).length, 1);
await finish("google_news", i, { ok: false, error_code: "ValueError" });
// Retention applies to old news and logs, never the current snapshot.
await pg.exec(
  "insert into external_news_items(id,guid,source_url,title,source_name,published_at) values ('old','old','https://example.com/old','old','News',now()-interval '31 days')",
);
await pg.exec(
  "insert into external_feed_runs(source,token,status,started_at) values ('google_news','00000000-0000-0000-0000-000000000099','failed',now()-interval '31 days')",
);
await pg.exec(
  "update external_feed_sources set next_attempt_at=now()-interval '1 second'",
);
const j = "00000000-0000-0000-0000-000000000010";
await claim("google_news", j);
await finish("google_news", j, { ok: true, not_modified: true });
assert.equal(
  (await query("select * from external_news_items where id='old'")).length,
  0,
);
assert.equal(
  (
    await query(
      "select * from external_feed_runs where started_at<now()-interval '30 days'",
    )
  ).length,
  0,
);
for (const role of ["anon", "authenticated"]) {
  await pg.exec(`set role ${role}`);
  await assert.rejects(query("select * from external_news_items"));
  await assert.rejects(query("select * from external_feed_sources"));
  await assert.rejects(claim("google_news", a));
  await assert.rejects(rpc("select list_external_news(10) result", []));
  await pg.exec("reset role");
}
await pg.exec("set role service_role");
assert.equal((await rpc("select list_external_news(10) result", [])).length, 1);
await pg.exec("reset role");
assert.equal(
  (
    await query(
      "select count(*)::int n from pg_class where relname in ('external_feed_sources','external_news_items','external_feed_runs') and relrowsecurity",
    )
  )[0].n,
  3,
);
await pg.close();
console.log(
  "External feeds SQL: leases, deduplication, updates, retry timing, 304, snapshots, rollback, retention and role isolation passed",
);
