// Restore the actual encrypted v2 snapshot and verify the metadata-only v3 cutover.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, writeFileSync, chmodSync } from "node:fs";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
const root = resolve(process.argv[2] ?? ""),
  schema = process.argv[3];
assert(process.argv[2] && schema && !root.startsWith(resolve(".") + "/"));
const meta = JSON.parse(readFileSync(join(root, "metadata.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
assert.equal(manifest.version, 2);
assert(
  meta.auth_tables &&
    meta.auth_tables.users.length === meta.auth_user_ids.length,
);
assert.equal(manifest.objects.length, meta.storage_objects.length);
const pg = new PGlite();
const ident = (s) => '"' + s.replaceAll('"', '""') + '"';
await pg.exec(
  readFileSync("backend/tests/fixtures/identifiers_baseline.sql", "utf8")
    .split("\n")
    .slice(1, 4)
    .join("\n") +
    "\ncreate schema storage;create table storage.objects(id uuid);",
);
await pg.exec(readFileSync(schema, "utf8"));
await pg.exec(
  readFileSync("supabase/bootstrap/recent_history_retention.sql", "utf8"),
);
for (const f of meta.functions) await pg.exec(f.definition);
for (const f of meta.private_functions) await pg.exec(f.definition);
const parents = new Map(
  Object.keys(manifest.tables).map((t) => [t, new Set()]),
);
for (const c of meta.constraints.filter((c) => c.type === "f")) {
  const m = c.definition.match(/REFERENCES (?:(\w+)\.)?(\w+)\(/);
  assert(m, "FK syntax");
  if (m[1] !== "auth" && m[2] !== c.table && parents.has(m[2]))
    parents.get(c.table).add(m[2]);
}
const order = [];
while (parents.size) {
  const next = [...parents].find(([, p]) => p.size === 0);
  assert(next, "unreviewed dependency cycle");
  const [t] = next;
  order.push(t);
  parents.delete(t);
  for (const p of parents.values()) p.delete(t);
}
await pg.exec("begin;");
for (const id of meta.auth_user_ids)
  await pg.query("insert into auth.users values($1)", [id]);
for (const t of order)
  await pg.exec(`alter table public.${ident(t)} disable trigger user;`);
for (const t of order) {
  const rows = readFileSync(join(root, t + ".jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map(JSON.parse);
  const cols = meta.columns
    .filter((c) => c.table_name === t && c.is_generated !== "ALWAYS")
    .map((c) => c.column_name);
  for (let i = 0; i < rows.length; i += 1000)
    await pg.query(
      `insert into public.${ident(t)}(${cols.map(ident)}) overriding system value select ${cols.map(ident)} from jsonb_populate_recordset(null::public.${ident(t)},$1)`,
      [JSON.stringify(rows.slice(i, i + 1000))],
    );
  assert.equal(rows.length, manifest.tables[t].rows);
}
await pg.query(
  "insert into private.identifier_aliases select * from jsonb_populate_recordset(null::private.identifier_aliases,$1)",
  [JSON.stringify(meta.private_aliases)],
);
for (const t of order)
  await pg.exec(`alter table public.${ident(t)} enable trigger user;`);
for (const t of meta.triggers) {
  const name = t.definition.match(/CREATE TRIGGER (\w+)/)[1];
  const mode = {
    D: "disable",
    O: "enable",
    A: "enable always",
    R: "enable replica",
  }[t.enabled];
  assert(mode);
  await pg.exec(
    `alter table public.${ident(t.table)} ${mode} trigger ${ident(name)}`,
  );
}
for (const seq of meta.sequences)
  if (seq.last_value != null)
    await pg.query("select setval($1::regclass,$2,true)", [
      seq.schemaname + "." + seq.sequencename,
      seq.last_value,
    ]);
await pg.exec("commit;");
const verify = async () => {
  for (const t of order) {
    const rows = readFileSync(join(root, t + ".jsonl"), "utf8")
      .split("\n")
      .filter(Boolean)
      .map(JSON.parse);
    assert.equal(
      (await pg.query(`select count(*) n from public.${ident(t)}`)).rows[0].n,
      rows.length,
    );
    for (let i = 0; i < rows.length; i += 1000) {
      const n = (
        await pg.query(
          `select count(*) n from(select to_jsonb(s) row from jsonb_populate_recordset(null::public.${ident(t)},$1) s except select to_jsonb(t) from public.${ident(t)} t) missing`,
          [JSON.stringify(rows.slice(i, i + 1000))],
        )
      ).rows[0].n;
      assert.equal(n, 0, "original values: " + t);
    }
  }
  const aliases = (
    await pg.query(
      "select coalesce(jsonb_agg(to_jsonb(a) order by entity,numeric_id),'[]') rows from private.identifier_aliases a",
    )
  ).rows[0].rows;
  assert.deepEqual(
    aliases,
    meta.private_aliases,
    "private aliases must remain identical",
  );
};
await verify();
await pg.exec(
  "begin;" +
    readFileSync(
      "supabase/migrations/20261101043458_private_identifier_aliases.sql",
      "utf8",
    ) +
    "commit;",
);
await verify();
assert.equal(
  (
    await pg.query(
      "select count(*) n from information_schema.columns where table_schema='public' and left(column_name,7)='legacy_'",
    )
  ).rows[0].n,
  0,
);
await pg.exec(
  "update private.identifier_control set maintenance=false;insert into auth.users values('00000000-0000-4000-8000-000000000001');insert into profiles(auth_user_id) values('00000000-0000-4000-8000-000000000001');",
);
await pg.exec(
  readFileSync("backend/tests/fixtures/clean_identifiers_checks.sql", "utf8"),
);
const report = {
  passed: true,
  auth_user_ids_preserved: meta.auth_user_ids.length,
  auth_snapshot_tables: Object.keys(meta.auth_tables).length,
  storage_objects_verified: meta.storage_objects.length,
  public_tables: order.length,
  original_public_values_preserved: true,
  private_aliases_preserved: meta.private_aliases.length,
  public_legacy_columns: 0,
  retry_and_business_rpcs: "passed",
  snapshot: manifest.archive_sha256,
};
writeFileSync(join(root, "clean-rehearsal.json"), JSON.stringify(report));
chmodSync(join(root, "clean-rehearsal.json"), 0o600);
console.log(JSON.stringify(report));
await pg.close();
