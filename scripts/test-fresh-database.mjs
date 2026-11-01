// Verify the exact private bootstrap artifact without network access.
import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "");
assert(process.argv[2] && !root.startsWith(resolve(".") + "/"));
const pg = new PGlite();
const clean = process.argv.includes("--clean");
await pg.exec(
  readFileSync("backend/tests/fixtures/identifiers_baseline.sql", "utf8")
    .split("\n")
    .slice(1, 4)
    .join("\n") +
    "\ncreate schema storage;create table storage.objects(id uuid);",
);
await pg.exec(readFileSync(join(root, "schema.sql"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const digests = {};
const ident = (s) => '"' + s.replaceAll('"', '""') + '"';
await pg.exec("begin;set local clearpath.identifier_migration='approved';");
for (const [table, detail] of Object.entries(manifest.tables)) {
  const rows = readFileSync(join(root, table + ".jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse);
  const cols = (
    await pg.query(
      "select column_name from information_schema.columns where table_schema='public' and table_name=$1 and is_generated<>'ALWAYS' order by ordinal_position",
      [table],
    )
  ).rows.map((c) => c.column_name);
  for (let i = 0; i < rows.length; i += 200) {
    const data = JSON.stringify(rows.slice(i, i + 200));
    await pg.query(
      `insert into public.${ident(table)}(${cols.map(ident)}) overriding system value select ${cols.map(ident)} from jsonb_populate_recordset(null::public.${ident(table)},$1)`,
      [data],
    );
    const differences = (
      await pg.query(
        `select count(*) n from (select to_jsonb(s) r from jsonb_populate_recordset(null::public.${ident(table)},$1) s except select to_jsonb(t) from public.${ident(table)} t) differences`,
        [data],
      )
    ).rows[0].n;
    assert.equal(differences, 0, `exact import values: ${table}`);
  }
  assert.equal(
    (await pg.query(`select count(*) n from public.${ident(table)}`)).rows[0].n,
    detail.rows,
  );
  digests[table] = (
    await pg.query(
      `select count(*) n,md5(coalesce(string_agg(h,'' order by h),'')) digest from (select md5(to_jsonb(t)::text) h from public.${ident(table)} t) rows`,
    )
  ).rows[0];
}
await pg.exec(readFileSync(join(root, "sequences.sql"), "utf8") + "commit;");
if (!clean)
  writeFileSync(
    join(root, "verification-digests.json"),
    JSON.stringify(digests),
  );
if (!clean) chmodSync(join(root, "verification-digests.json"), 0o600);
if (clean) {
  await pg.exec(
    "begin;" +
      readFileSync(
        "supabase/migrations/20261101043458_private_identifier_aliases.sql",
        "utf8",
      ) +
      "commit;",
  );
  assert.equal(
    (
      await pg.query(
        "select count(*) n from information_schema.columns where table_schema='public' and left(column_name,7)='legacy_' ",
      )
    ).rows[0].n,
    0,
  );
}
await pg.exec(
  readFileSync("supabase/bootstrap/recent_history_retention.sql", "utf8"),
);
assert.deepEqual(
  (await pg.query("select private.prune_recent_history(1) r")).rows[0].r,
  { skipped: "identifier_maintenance" },
);
await pg.exec("update private.identifier_control set maintenance=false;");
// A fresh write receives a DB-allocated code and the seeded sequence never resets.
const n = (
  await pg.query(
    clean
      ? "insert into sync_runs(source,status) values('fresh_seed_smoke','success') returning id,code"
      : "insert into sync_runs(legacy_id,source,status) values(gen_random_uuid(),'fresh_seed_smoke','success') returning id,code",
  )
).rows[0];
assert(n.id > manifest.tables.sync_runs.rows);
assert.match(n.code, /^SYN-[0-9]{6,}$/);
await pg.exec(
  "insert into auth.users values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');",
);
const users = (
  await pg.query(
    clean
      ? "insert into profiles(auth_user_id,display_name) select id,'Local test user' from auth.users returning id,code"
      : "insert into profiles(legacy_id,auth_user_id,display_name) select id,id,'Local test user' from auth.users returning id,code",
  )
).rows;
assert.equal(users.length, 2);
assert(users.every((p) => /^USR-[0-9]{6,}$/.test(p.code)));
await pg.exec(
  "set role authenticated;set request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';",
);
assert.equal((await pg.query("select count(*) n from profiles")).rows[0].n, 1);
let denied = false;
try {
  await pg.query("select private.prune_recent_history(1000)");
} catch {
  denied = true;
}
assert(denied, "authenticated cannot invoke privileged retention");
await pg.exec("reset role;");
const station = (await pg.query("select id from stations limit 1")).rows[0].id;
await pg.query(
  "insert into pm25_readings(station_id,pm25,recorded_at,source_at) values($1,1,now()-interval '10 days',now()-interval '10 days'),($1,2,now()-interval '9 days',now()-interval '9 days')",
  [station],
);
const before = (await pg.query("select count(*) n from pm25_readings")).rows[0]
  .n;
const result = (await pg.query("select private.prune_recent_history(1) r"))
  .rows[0].r;
assert.equal(result.pm25_readings, 1);
assert.equal(
  (await pg.query("select count(*) n from pm25_readings")).rows[0].n,
  before - 1,
);
assert.equal((await pg.query("select count(*) n from profiles")).rows[0].n, 2);
assert.equal(
  (await pg.query("select count(*) n from cams_grid_active")).rows[0].n,
  1,
);
console.log(
  "Passed: exact seed values, FK enforcement, fresh generated IDs, sequence continuity, user isolation, retention limits, active CAMS protection.",
);
if (clean) {
  await pg.exec(
    readFileSync("backend/tests/fixtures/clean_identifiers_checks.sql", "utf8"),
  );
  await pg.exec("set role anon;");
  await assert.rejects(
    pg.query("select identifier_insert('sync_runs','[]','[]')"),
    /permission denied/,
  );
  await pg.exec("reset role;");
  console.log(
    "Clean schema: retry resurrection, moderation deduplication, request/notification atomic RPCs and service-only permissions passed.",
  );
}
await pg.close();
