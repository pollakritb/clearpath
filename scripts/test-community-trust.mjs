import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
const pg = new PGlite();
await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;
create table public.profiles(id bigint primary key);
create table public.community_reports(id bigint primary key,user_id bigint references profiles(id),status text,captured_at timestamptz,image_path text,evidence_purged_at timestamptz,lat float8,lon float8,duplicate_detected boolean default false);
create table public.report_reactions(report_id bigint,user_id bigint,reaction text,created_at timestamptz,updated_at timestamptz,reason_code text,geofence_policy text,primary key(report_id,user_id));`);
await pg.exec(
  readFileSync(
    new URL(
      "../supabase/migrations/20261107112234_community_trust_v1.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
const q = async (sql, args = []) => (await pg.query(sql, args)).rows;
const result = async (sql, args = []) => (await q(sql, args))[0].result;
for (let id = 1; id <= 15; id++)
  await q("insert into profiles values($1)", [id]);
await pg.exec(
  "update community_trust_private.control set notice_ref='reviewed-test-policy-notice',collecting_enabled=true",
);
await assert.rejects(() =>
  pg.exec("update community_trust_private.control set public_enabled=true"),
);
await pg.exec(
  "insert into community_reports values(101,1,'approved',now()-interval '10 minutes','private/image',null,13.8,100.1,false),(102,1,'approved',now()-interval '10 minutes','private/image',null,13.8,100.1,false)",
);
let number = 1;
const key = () =>
  `00000000-0000-4000-8000-${String(number++).padStart(12, "0")}`;
const payload = (reaction = "like", reason_code = "useful") => ({
  policy_version: "community-trust-v1",
  reaction,
  reason_code,
  evidence_available: true,
  location: {
    lat: 13.8,
    lon: 100.1,
    accuracy_m: 10,
    observed_at: new Date().toISOString(),
  },
});
const vote = (
  voter,
  report = 101,
  body = payload(),
  id = key(),
  action = "set",
) =>
  result("select community_trust_react($1,$2,$3,$4,$5) result", [
    voter,
    report,
    id,
    action,
    JSON.stringify(body),
  ]);
const id = key();
let first = await vote(2, 101, payload(), id);
assert.equal(first.trust_eligible, true);
assert.deepEqual(await vote(2, 101, payload(), id), first);
assert.equal(
  (await q("select * from community_trust_private.events where action='set'"))
    .length,
  1,
);
await assert.rejects(() =>
  vote(2, 101, payload("dislike", "report_context_doubt"), id),
);
await vote(2, 102, payload("dislike", "report_context_doubt"));
let slots = await q("select * from community_trust_private.daily_slots");
assert.equal(slots.length, 1);
assert.equal(Number(slots[0].report_id), 102);
await vote(2, 101, {}, key(), "withdraw");
slots = await q("select * from community_trust_private.daily_slots");
assert.equal(Number(slots[0].report_id), 102);
await vote(2, 102, {}, key(), "withdraw");
slots = await q("select * from community_trust_private.daily_slots");
assert.equal(slots[0].event_seq, null);
assert.equal(
  (await q("select * from community_trust_private.pair_days")).length,
  1,
);
assert.equal(
  (await vote(3, 101, payload("dislike", "ocr_mismatch")))
    .trust_exclusion_reason,
  "reason_not_trust",
);
assert.equal(
  (
    await vote(3, 101, {
      ...payload(),
      location: { ...payload().location, accuracy_m: 501 },
    })
  ).trust_exclusion_reason,
  "gps_uncertain",
);
assert.equal(
  (await vote(3, 101, { ...payload(), evidence_available: false }))
    .trust_exclusion_reason,
  "evidence_unavailable",
);
await assert.rejects(() => vote(1));
await vote(2);
await pg.exec(
  "insert into community_trust_private.pair_days values(3,1,(now() at time zone 'Asia/Bangkok')::date-1,true,now()),(3,1,(now() at time zone 'Asia/Bangkok')::date-2,true,now()),(3,1,(now() at time zone 'Asia/Bangkok')::date-3,true,now())",
);
assert.equal((await vote(3)).trust_exclusion_reason, "pair_day_limit");
await pg.exec(
  "delete from community_trust_private.pair_days where voter_id=3 and vote_day<(now() at time zone 'Asia/Bangkok')::date",
);
assert.equal((await vote(3)).trust_exclusion_reason, "pair_day_limit");
for (let voter = 4; voter <= 12; voter++) await vote(voter);
const holds = await q("select * from community_trust_private.holds");
assert.equal(holds.length, 1);
assert.equal(
  new Date(holds[0].expires_at) - new Date(holds[0].started_at),
  1800000,
);
await vote(13);
assert.equal(
  (await q("select * from community_trust_private.holds")).length,
  1,
);
const snapshot = await result("select community_trust_snapshot(1) result");
assert.ok(snapshot.events.length > 10);
assert.equal(
  await result(
    "select community_trust_store_projection(1,0,'{\"daily\":[]}'::jsonb) result",
  ),
  false,
);
await pg.exec("set role authenticated");
await assert.rejects(() => q("select * from community_trust_private.events"));
await assert.rejects(() => q("select community_trust_snapshot(1)"));
await pg.exec("reset role");
await assert.rejects(() =>
  result(
    "select community_trust_request_review(1,101,null,null,'request a review') result",
  ),
);
console.log(
  "community trust SQL: replay inputs, retry, replacement, withdrawal, pair quota, hold, CAS, RLS and release gates passed",
);
await pg.close();
