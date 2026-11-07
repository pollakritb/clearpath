// Retained historical audit schema privacy/revision checks; no runtime score or ingestion is activated.
// Local PostgreSQL rehearsal. No hosted credentials or network access.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const pg = new PGlite();
await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls;
create schema private;
create table public.profiles(id bigint primary key);
create table public.community_reports(id bigint primary key,user_id bigint references profiles(id));
insert into profiles values(1),(2);insert into community_reports values(10,1),(20,2);
create function private.identifier_number(tab text, val text) returns bigint language sql as $$ select val::bigint $$;
`);
await pg.exec(
  readFileSync(
    "supabase/migrations/20261106100000_reporter_trust_audits.sql",
    "utf8",
  ),
);
const row = {
  audit_key: "audit-key-0001",
  case_key: "case-key-0001",
  sample_key: "sample-key-0001",
  user_id: "1",
  report_id: "10",
  revision: 1,
  outcome: "pass",
  fault_domain: "reporting",
  evaluator_key: "independent-team",
  evidence_ref: "controlled-field-protocol",
  evaluated_at: "2026-01-01T00:00:00+00:00",
};
for (const role of ["anon", "authenticated"]) {
  await pg.exec(`set role ${role}`);
  await assert.rejects(
    pg.query("select * from community_reporter_audits"),
    /permission denied/,
  );
  await assert.rejects(
    pg.query("select ingest_reporter_audit($1::jsonb)", [JSON.stringify(row)]),
    /permission denied/,
  );
  await pg.exec("reset role");
}
await pg.exec("set role service_role");
for (let i = 0; i < 2; i++)
  await pg.query("select ingest_reporter_audit($1::jsonb)", [
    JSON.stringify(row),
  ]);
assert.equal(
  (await pg.query("select count(*) n from community_reporter_audits")).rows[0]
    .n,
  1,
);
await assert.rejects(
  pg.query("update community_reporter_audits set outcome='problem'"),
  /permission denied/,
);
await assert.rejects(
  pg.query("select ingest_reporter_audit($1::jsonb)", [
    JSON.stringify({ ...row, outcome: "problem" }),
  ]),
  /audit_key_conflict/,
);
await assert.rejects(
  pg.query("select ingest_reporter_audit($1::jsonb)", [
    JSON.stringify({ ...row, audit_key: "audit-other-1", user_id: "2" }),
  ]),
  /audit_subject_mismatch/,
);
await assert.rejects(
  pg.query("select ingest_reporter_audit($1::jsonb)", [
    JSON.stringify({ ...row, audit_key: "audit-other-2", revision: 3 }),
  ]),
  /audit_revision_conflict/,
);
await assert.rejects(
  pg.query("select ingest_reporter_audit($1::jsonb)", [
    JSON.stringify({
      ...row,
      audit_key: "audit-other-3",
      revision: 2,
      sample_key: "changed-sample",
    }),
  ]),
  /audit_case_identity_immutable/,
);
await pg.query("select ingest_reporter_audit($1::jsonb)", [
  JSON.stringify({
    ...row,
    audit_key: "audit-key-revision2",
    revision: 2,
    outcome: "problem",
  }),
]);
assert.equal(
  (await pg.query("select count(*) n from community_reporter_audits")).rows[0]
    .n,
  2,
);
await pg.exec("reset role");
for (const role of ["anon", "authenticated"]) {
  await pg.exec(`set role ${role}`);
  await assert.rejects(
    pg.query("select * from community_reporter_review_requests"),
    /permission denied/,
  );
  await assert.rejects(
    pg.query(
      "select request_reporter_review(1,'audit-key-revision2','Please recheck evidence')",
    ),
    /permission denied/,
  );
  await pg.exec("reset role");
}
await pg.exec("set role service_role");
await assert.rejects(
  pg.query(
    "select request_reporter_review(2,'audit-key-revision2','Please recheck evidence')",
  ),
  /review_subject_mismatch/,
);
await assert.rejects(
  pg.query(
    "select request_reporter_review(1,'audit-key-0001','Please recheck evidence')",
  ),
  /audit_case_updated/,
);
const review = (
  await pg.query(
    "select request_reporter_review(1,'audit-key-revision2','Please recheck evidence') value",
  )
).rows[0].value;
assert.equal(review.status, "pending");
assert.deepEqual(
  (
    await pg.query(
      "select request_reporter_review(1,'audit-key-revision2','Please recheck evidence') value",
    )
  ).rows[0].value,
  review,
);
assert.equal(
  (await pg.query("select count(*) n from community_reporter_audits")).rows[0]
    .n,
  2,
);
await pg.query("select ingest_reporter_audit($1::jsonb)", [
  JSON.stringify({ ...row, audit_key: "audit-key-revision3", revision: 3 }),
]);
assert.equal(
  (await pg.query("select status from community_reporter_review_requests"))
    .rows[0].status,
  "reviewed",
);
await assert.rejects(
  pg.query("update community_reporter_review_requests set status='pending'"),
  /permission denied/,
);
await pg.exec("reset role");
assert.equal(
  (
    await pg.query(
      "select relrowsecurity from pg_class where oid='community_reporter_audits'::regclass",
    )
  ).rows[0].relrowsecurity,
  true,
);
await pg.exec(
  readFileSync(
    "supabase/migrations/20261106101000_account_privacy_requests.sql",
    "utf8",
  ),
);
await pg.exec("set role anon");
await assert.rejects(
  pg.query("select request_account_erasure(1)"),
  /permission denied/,
);
await pg.exec("reset role; set role service_role");
const request1 = (await pg.query("select request_account_erasure(1) value"))
  .rows[0].value;
const request2 = (await pg.query("select request_account_erasure(1) value"))
  .rows[0].value;
assert.equal(request1.id, request2.id);
assert.equal(request1.status, "pending");
assert.equal(Object.hasOwn(request1, "user_id"), false);
assert.equal(
  (await pg.query("select count(*) n from account_privacy_requests")).rows[0].n,
  1,
);
await pg.exec("reset role");
await pg.close();
console.log(
  "Reporter audit migration: RLS, server-only ingestion, immutable history, ownership, replay and revision checks passed.",
);
