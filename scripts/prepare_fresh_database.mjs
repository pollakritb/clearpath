// Prepare a small, private, reproducible seed. Never connects to production.
import { PGlite } from "@electric-sql/pglite";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  createReadStream,
  readFileSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
} from "node:fs";
import { createInterface } from "node:readline";
import { resolve, join } from "node:path";

const [sourceArg, outputArg, asOfArg] = process.argv.slice(2);
if (!sourceArg || !outputArg || !asOfArg)
  throw new Error(
    "Usage: node scripts/prepare_fresh_database.mjs PRIVATE_BACKUP PRIVATE_OUTPUT AS_OF_ISO",
  );
const source = resolve(sourceArg),
  output = resolve(outputArg),
  repo = resolve(".");
assert(!output.startsWith(repo + "/") && !source.startsWith(repo + "/"));
assert(source !== output);
const asOf = new Date(asOfArg),
  cutoff = new Date(asOf.getTime() - 72 * 3600_000);
assert(Number.isFinite(asOf.getTime()));
const readRows = async (table) => {
  const rows = [];
  for await (const line of createInterface({
    input: createReadStream(join(source, table + ".jsonl")),
    crlfDelay: Infinity,
  }))
    if (line) rows.push(JSON.parse(line));
  return rows;
};
const recent = (value) =>
  value && new Date(value) >= cutoff && new Date(value) <= asOf;
const manifest = JSON.parse(
  readFileSync(join(source, "manifest.json"), "utf8"),
);
assert.equal(Object.keys(manifest.tables).length, 44);
const selected = {};
selected.stations = await readRows("stations");
selected.pm25_readings = (await readRows("pm25_readings")).filter((r) =>
  recent(r.recorded_at),
);
selected.sync_runs = (await readRows("sync_runs")).filter(
  (r) => recent(r.started_at) && r.status !== "running",
);
selected.weather_observations = (await readRows("weather_observations")).filter(
  (r) => recent(r.recorded_at),
);
selected.fire_feature_snapshots = (
  await readRows("fire_feature_snapshots")
).filter((r) => recent(r.recorded_at));
selected.forecast_data_quality_daily = (
  await readRows("forecast_data_quality_daily")
).filter((r) => recent(r.quality_date));
// A provider run can cover just one station batch. Retain the latest complete
// success for EACH batch, otherwise five sixths of the stations disappear.
const latestRuns = new Map();
for (const r of await readRows("forecast_provider_sync_runs")) {
  if (r.status !== "success" || !recent(r.started_at)) continue;
  const key = JSON.stringify([r.provider, r.metadata?.batch_index ?? null]);
  if (!latestRuns.has(key) || r.started_at > latestRuns.get(key).started_at)
    latestRuns.set(key, r);
}
selected.forecast_provider_sync_runs = [...latestRuns.values()];
const runIds = new Set(selected.forecast_provider_sync_runs.map((r) => r.id));
selected.forecast_provider_snapshots = (
  await readRows("forecast_provider_snapshots")
).filter((r) => runIds.has(r.sync_run_id));
const activeRows = await readRows("cams_grid_active");
const active = new Set(activeRows.map((r) => r.generation_id));
const generations = (await readRows("cams_grid_generations")).filter((r) =>
  active.has(r.id),
);
assert(
  generations.every((r) => r.status === "ready" && recent(r.retrieved_at)),
);
const grids = new Set(generations.map((r) => r.grid_id));
selected.cams_grid_definitions = (
  await readRows("cams_grid_definitions")
).filter((r) => grids.has(r.id));
selected.cams_grid_generations = generations;
selected.cams_grid_frames = (await readRows("cams_grid_frames")).filter((r) =>
  active.has(r.generation_id),
);
selected.cams_grid_active = activeRows;
// Intentionally no profiles, Auth, community, XP history, messages, photos,
// leases, camera sessions, retry queues, or in-progress CAMS jobs.
const pg = new PGlite();
const baseline = readFileSync(
  "backend/tests/fixtures/identifiers_baseline.sql",
  "utf8",
);
const managedSetup = baseline.split("\n").slice(1, 4).join("\n");
assert(
  managedSetup.includes("create role anon;") &&
    managedSetup.includes("create function auth.uid()"),
);
const appBaseline = baseline.split("\n").slice(4).join("\n");
const migrations = [
  "20261101005119_identifier_rollout_control",
  "20261101002656_readable_identifiers_expand",
  "20261101005121_numeric_identifier_cutover",
];
const control = readFileSync(
  `supabase/migrations/${migrations[0]}.sql`,
  "utf8",
);
const expansion = readFileSync(
  `supabase/migrations/${migrations[1]}.sql`,
  "utf8",
);
const cutover = readFileSync(
  `supabase/migrations/${migrations[2]}.sql`,
  "utf8",
);
const lockdown = `
alter function public.block_forecast_writes_during_reset() set search_path='';
revoke all on all tables in schema public from public,anon,authenticated;
grant select on public.profiles,public.user_notifications to authenticated;
grant select on public.public_map_events to anon,authenticated;
revoke all on all functions in schema public from public,anon,authenticated;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public revoke all on tables from anon,authenticated;
alter default privileges in schema public revoke execute on functions from public,anon,authenticated;
`;
const schema = `begin;
set local statement_timeout='90s';
do $$ begin
 if exists(select 1 from information_schema.tables where table_schema='public' and table_type='BASE TABLE')
 or exists(select 1 from auth.users) or exists(select 1 from storage.objects)
 then raise exception 'fresh_empty_project_required'; end if;
end $$;
${appBaseline}
${control}
update private.identifier_control set maintenance=true;
${expansion}
${cutover}
${lockdown}
commit;`;
// Exercise the exact fresh schema, using real Supabase managed objects only on
// the server. Local stubs contain NO users and are never exported for deployment.
await pg.exec(
  managedSetup +
    "\ncreate schema storage;create table storage.objects(id uuid);",
);
await pg.exec(schema);
const ident = (s) => '"' + s.replaceAll('"', '""') + '"';
// Build deterministic numeric IDs locally from the selected old rows. All
// generated columns are excluded from inserts; identity is allocated by DB.
const refs = JSON.parse(
  readFileSync("backend/services/identifier-relations.json", "utf8"),
);
const uuidRoots = new Set(
  JSON.parse(readFileSync(join(source, "metadata.json"), "utf8"))
    .columns.filter((c) => c.column_name === "id" && c.udt_name === "uuid")
    .map((c) => c.table_name),
);
const maps = {};
await pg.exec("begin;set local clearpath.identifier_migration='approved';");
for (const [table, rows] of Object.entries(selected)) {
  maps[table] = new Map();
  const columns = (
    await pg.query(
      "select column_name,is_generated,is_identity from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position",
      [table],
    )
  ).rows;
  for (const row of rows) {
    const originalId = row.id;
    const converted = { ...row };
    if (uuidRoots.has(table)) {
      converted.legacy_id = originalId;
      delete converted.id;
    }
    for (const ref of refs.filter((r) => r.table === table)) {
      const value = row[ref.column];
      converted["legacy_" + ref.column] = value;
      converted[ref.column] =
        value == null ? null : maps[ref.parent]?.get(value);
      if (value != null)
        assert(
          converted[ref.column] != null,
          `missing parent ${table}.${ref.column}`,
        );
    }
    const insertCols = columns
      .filter(
        (c) =>
          c.is_generated !== "ALWAYS" &&
          (c.is_identity !== "YES" || converted[c.column_name] != null) &&
          Object.hasOwn(converted, c.column_name),
      )
      .map((c) => c.column_name);
    const value = (
      await pg.query(
        `insert into public.${ident(table)}(${insertCols.map(ident)}) overriding system value select ${insertCols.map(ident)} from jsonb_populate_record(null::public.${ident(table)},$1) returning *`,
        [JSON.stringify(converted)],
      )
    ).rows[0];
    if (originalId != null) maps[table].set(originalId, value.id);
  }
}
await pg.exec(
  "insert into public.community_xp_control(singleton,enabled,maintenance) values(true,true,false);commit;",
);
// Live import will insert explicit numbers; advance every sequence afterwards.
const sequences = (
  await pg.query(
    `select table_name,column_name,column_default,pg_get_serial_sequence(format('public.%I',table_name),column_name) seq from information_schema.columns where table_schema='public' and (is_identity='YES' or column_default like 'nextval(%')`,
  )
).rows;
const sequenceSql = sequences
  .map((s) => {
    // Legacy BIGSERIAL defaults can reference a sequence without OWNED BY.
    const legacy = s.seq == null;
    const seq =
      s.seq ?? s.column_default?.match(/^nextval\('([^']+)'::regclass\)$/)?.[1];
    assert(seq && /^[a-z_][a-z_0-9.]*$/.test(seq));
    return (
      (legacy
        ? `alter sequence ${seq} owned by public.${ident(s.table_name)}.${ident(s.column_name)};\n`
        : "") +
      `select setval('${seq}'::regclass,greatest(coalesce((select max(${ident(s.column_name)}) from public.${ident(s.table_name)}),0)+1,1),false);`
    );
  })
  .join("\n");
mkdirSync(output, { mode: 0o700 });
const put = (name, content) => {
  writeFileSync(join(output, name), content, { mode: 0o600 });
  chmodSync(join(output, name), 0o600);
};
put("schema.sql", schema);
put("sequences.sql", sequenceSql);
const summary = {
  as_of: asOf.toISOString(),
  cutoff: cutoff.toISOString(),
  reset_user_data: true,
  source_project: manifest.project,
  bootstrap_sha256: createHash("sha256").update(schema).digest("hex"),
  sequences_sha256: createHash("sha256").update(sequenceSql).digest("hex"),
  tables: {},
};
for (const table of [...Object.keys(selected), "community_xp_control"]) {
  const rows = (await pg.query(`select * from public.${ident(table)}`)).rows;
  const content =
    rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
  put(table + ".jsonl", content);
  summary.tables[table] = {
    rows: rows.length,
    bytes: Buffer.byteLength(content),
    sha256: createHash("sha256").update(content).digest("hex"),
  };
}
assert.equal(
  (await pg.query("select count(*) n from public.profiles")).rows[0].n,
  0,
);
assert.equal(
  (await pg.query("select count(*) n from public.community_reports")).rows[0].n,
  0,
);
// Real insert smoke test: no numeric or code supplied, sequence allocates both.
await pg.exec("begin;set local clearpath.identifier_migration='approved';");
const smoke = (
  await pg.query(
    "insert into public.sync_runs(legacy_id,source,status) values(gen_random_uuid(),'bootstrap_smoke','success') returning id,code",
  )
).rows[0];
assert.match(smoke.code, /^SYN-[0-9]{6,}$/);
assert(Number(smoke.id) > 0);
await pg.exec("rollback;");
summary.new_record_smoke_passed = true;
put("manifest.json", JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify(summary));
await pg.close();
