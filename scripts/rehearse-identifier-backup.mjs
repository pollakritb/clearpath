// PRIVATE restore + exact original-column comparison. Argument must be outside Git.
import { PGlite } from "@electric-sql/pglite";
import {
  readFileSync,
  createReadStream,
  readdirSync,
  writeFileSync,
  chmodSync,
} from "node:fs";
import { createInterface } from "node:readline";
import { resolve, join } from "node:path";
import assert from "node:assert/strict";
const root = resolve(process.argv[2] ?? ""),
  repo = resolve(new URL("..", import.meta.url).pathname);
if (!process.argv[2] || root.startsWith(repo + "/"))
  throw new Error(
    "Restore directory must be private and outside the repository",
  );
const meta = JSON.parse(readFileSync(join(root, "metadata.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const ident = (s) => '"' + s.replaceAll('"', '""') + '"';
const pg = new PGlite();
const migrate = (suffix) =>
  readFileSync(
    new URL(
      "../supabase/migrations/" +
        readdirSync(new URL("../supabase/migrations/", import.meta.url)).find(
          (x) => x.endsWith(suffix + ".sql"),
        ),
      import.meta.url,
    ),
    "utf8",
  );
const by = {};
for (const c of meta.columns) (by[c.table_name] ??= []).push(c);
await pg.exec(
  "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;",
);
for (const seq of meta.sequences ?? [])
  await pg.exec(
    `create sequence ${ident(seq.schemaname)}.${ident(seq.sequencename)}`,
  );
for (const [table, cols] of Object.entries(by)) {
  const defs = cols.map(
    (c) =>
      `${ident(c.column_name)} ${c.udt_name.startsWith("_") ? c.udt_name.slice(1) + "[]" : c.udt_name}${c.column_default ? " default " + c.column_default : ""}${c.is_nullable === "NO" ? " not null" : ""}`,
  );
  await pg.exec(`create table public.${ident(table)}(${defs.join(",")})`);
}
for (const kind of ["p", "u", "c", "f"])
  for (const c of meta.constraints)
    if (c.type === kind)
      await pg.exec(
        `alter table public.${ident(c.table)} add constraint ${ident(c.name)} ${c.definition}`,
      );
await pg.exec(migrate("identifier_rollout_control"));
for (const f of meta.functions) await pg.exec(f.definition);
for (const i of meta.indexes)
  await pg.exec(i.indexdef.replace("INDEX ", "INDEX IF NOT EXISTS "));
for (const t of meta.triggers)
  if (!t.definition.includes("CREATE TRIGGER identifier_maintenance "))
    await pg.exec(t.definition);
for (const p of meta.policies) {
  await pg.exec(
    `create policy ${ident(p.policyname)} on public.${ident(p.tablename)} as ${p.permissive} for ${p.cmd} to ${p.roles.map(ident).join(",")}${p.qual ? " using (" + p.qual + ")" : ""}${p.with_check ? " with check (" + p.with_check + ")" : ""}`,
  );
}
const existingRoles = new Set(
  (await pg.query("select rolname from pg_roles")).rows.map((r) => r.rolname),
);
for (const role of new Set(meta.grants.map((g) => g.grantee)))
  if (!existingRoles.has(role)) {
    await pg.exec(`create role ${ident(role)}`);
    existingRoles.add(role);
  }
for (const g of meta.grants)
  await pg.exec(
    `grant ${g.privilege_type} on public.${ident(g.table_name)} to ${ident(g.grantee)}`,
  );
for (const t of meta.table_security ?? [])
  if (t.rls)
    await pg.exec(
      `alter table public.${ident(t.table)} enable row level security`,
    );
for (const f of meta.functions)
  if (f.acl != null) {
    const match = f.definition.match(/FUNCTION public\.([^\(]+)\((.*?)\)\n/s);
    const signature = `public.${match[1]}(${match[2].replace(/\s+DEFAULT\s+[^,]+/gi, "")})`;
    await pg.exec(
      `revoke all on function ${signature} from public,anon,authenticated,service_role`,
    );
    for (const entry of f.acl.slice(1, -1).split(",")) {
      const a = entry.match(/^([^=]*)=([^/]*)\//);
      if (!a || !a[2].includes("X")) continue;
      const role = a[1].replaceAll('"', "");
      if (role && !existingRoles.has(role)) {
        await pg.exec(`create role ${ident(role)}`);
        existingRoles.add(role);
      }
      await pg.exec(
        `grant execute on function ${signature} to ${role ? ident(role) : "public"}${a[2].includes("X*") ? " with grant option" : ""}`,
      );
    }
  }
for (const t of meta.table_security ?? [])
  if (t.force)
    await pg.exec(
      `alter table public.${ident(t.table)} force row level security`,
    );
for (const id of meta.auth_user_ids)
  await pg.query("insert into auth.users values($1)", [id]);
// Load the snapshot without firing business triggers; validate every FK below.
for (const table of Object.keys(by))
  await pg.exec(`alter table public.${ident(table)} disable trigger all`);
const started = Date.now();
for (const table of Object.keys(by)) {
  let batch = [],
    count = 0;
  const flush = async () => {
    if (batch.length) {
      await pg.query(
        `insert into public.${ident(table)} select * from jsonb_populate_recordset(null::public.${ident(table)},$1)`,
        [JSON.stringify(batch)],
      );
      batch = [];
    }
  };
  for await (const line of createInterface({
    input: createReadStream(join(root, table + ".jsonl")),
    crlfDelay: Infinity,
  })) {
    batch.push(JSON.parse(line));
    count++;
    if (batch.length >= 1000) await flush();
  }
  await flush();
  assert.equal(count, manifest.tables[table].rows, table);
  console.log(JSON.stringify({ restored: table, rows: count }));
}
for (const seq of meta.sequences ?? [])
  if (seq.last_value != null)
    await pg.query("select setval($1::regclass,$2,true)", [
      seq.schemaname + "." + seq.sequencename,
      seq.last_value,
    ]);
for (const table of Object.keys(by))
  await pg.exec(`alter table public.${ident(table)} enable trigger all`);
for (const t of meta.triggers) {
  const name = t.definition.match(/CREATE TRIGGER (\w+)/)[1];
  const mode = {
    D: "disable",
    O: "enable",
    A: "enable always",
    R: "enable replica",
  }[t.enabled ?? "O"];
  await pg.exec(
    `alter table public.${ident(t.table)} ${mode} trigger ${ident(name)}`,
  );
}
// Exact original row comparison before/after. Use aliases for original UUID fields
// after cutover, keeping all original business values and all old IDs accountable.
const references = JSON.parse(
  readFileSync(
    new URL("../backend/services/identifier-relations.json", import.meta.url),
    "utf8",
  ),
);
const entityUUID = new Set(
  Object.entries(by)
    .filter(([, cs]) =>
      cs.some((c) => c.column_name === "id" && c.udt_name === "uuid"),
    )
    .map(([t]) => t),
);
const compare = async (converted) => {
  for (const [table, cols] of Object.entries(by)) {
    const projection = cols
      .map((c) => {
        const column = c.column_name;
        const changed =
          converted &&
          ((column === "id" && entityUUID.has(table)) ||
            references.some((r) => r.table === table && r.column === column) ||
            (table === "community_xp_accounts" && column === "member_id"));
        return `${ident(changed ? "legacy_" + column : column)} as ${ident(column)}`;
      })
      .join(",");
    const order = manifest.tables[table].pk.map(ident).join(",");
    let page = [],
      offset = 0,
      index = 0;
    for await (const line of createInterface({
      input: createReadStream(join(root, table + ".jsonl")),
      crlfDelay: Infinity,
    })) {
      if (index >= page.length) {
        page = (
          await pg.query(
            `select to_jsonb(t) as row from (select ${projection} from public.${ident(table)}) t order by ${order} limit 2000 offset ${offset}`,
          )
        ).rows;
        offset += page.length;
        index = 0;
      }
      // Do not print private rows when a mismatch occurs.
      try {
        assert.deepEqual(page[index++].row, JSON.parse(line));
      } catch {
        throw new Error(
          `original_column_mismatch: ${table} near row ${offset - page.length + index}`,
        );
      }
    }
    assert.equal(
      (await pg.query(`select count(*) n from public.${ident(table)}`)).rows[0]
        .n,
      manifest.tables[table].rows,
      table,
    );
  }
};
await compare(false);
await pg.exec("update private.identifier_control set maintenance=true");
await pg.exec("begin");
await pg.exec(migrate("readable_identifiers_expand"));
await pg.exec(migrate("numeric_identifier_cutover"));
await pg.exec("commit");
await compare(true);
// Every original FK is recreated and all current entity/reference columns use int8.
const orphans = [];
for (const c of meta.constraints.filter((c) => c.type === "f")) {
  const m = c.definition.match(
    /FOREIGN KEY \((\w+)\) REFERENCES (?:(\w+)\.)?(\w+)\((\w+)\)/,
  );
  if (!m) throw new Error("unreviewed FK shape");
  let [, column, schema, parent, parentCol] = m;
  schema ??= "public";
  if (c.table === "profiles" && schema === "auth") column = "auth_user_id";
  const n = (
    await pg.query(
      `select count(*) n from public.${ident(c.table)} t left join ${ident(schema)}.${ident(parent)} p on p.${ident(parentCol)}=t.${ident(column)} where t.${ident(column)} is not null and p.${ident(parentCol)} is null`,
    )
  ).rows[0].n;
  if (n) orphans.push(c.name);
}
assert.deepEqual(orphans, []);
const result = {
  passed: true,
  project: manifest.project,
  tables: Object.keys(by).length,
  rows: Object.values(manifest.tables).reduce((n, x) => n + x.rows, 0),
  original_columns_preserved: true,
  foreign_key_orphans: 0,
  elapsed_seconds: Math.round((Date.now() - started) / 1000),
};
const artifact = join(root, "rehearsal.json");
writeFileSync(artifact, JSON.stringify(result));
chmodSync(artifact, 0o600);
console.log(JSON.stringify(result));
await pg.close();
