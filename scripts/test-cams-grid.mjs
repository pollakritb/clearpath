import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const pg = new PGlite();
await pg.exec(
  "create role anon;create role authenticated;create role service_role bypassrls;",
);
await pg.exec(
  readFileSync(
    new URL(
      "../supabase/migrations/20261029193517_cams_forecast_grid.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
const token = "00000000-0000-0000-0000-000000000001";
const token2 = "00000000-0000-0000-0000-000000000002";
const slot = new Date();
slot.setUTCHours(Math.floor(slot.getUTCHours() / 6) * 6, 0, 0, 0);
const grid = { id: "test", latitudes: [13.6, 14], longitudes: [100, 100.4] };
const result = async (sql, args) => (await pg.query(sql, args)).rows[0].result;
const job = await result("select claim_cams_grid($1,$2,$3,1) result", [
  slot.toISOString(),
  token,
  JSON.stringify(grid),
]);
if (job.status !== "claimed") throw Error("claim");
const second = await result("select claim_cams_grid($1,$2,$3,1) result", [
  slot.toISOString(),
  token2,
  JSON.stringify(grid),
]);
if (second.status !== "in_progress") throw Error("lease");
const chunk = {
  times: [new Date(Date.now() + 3600000).toISOString()],
  cells: [],
};
await result("select checkpoint_cams_grid($1,$2,0,$3) result", [
  job.id,
  token,
  JSON.stringify(chunk),
]);
let rejected = false;
try {
  await result("select publish_cams_grid($1,$2,$3,$4) result", [
    job.id,
    token,
    JSON.stringify([{ valid_at: chunk.times[0], values: [1, 2] }]),
    "bad",
  ]);
} catch {
  rejected = true;
}
if (!rejected) throw Error("shape");
if ((await pg.query("select * from cams_grid_active")).rows.length)
  throw Error("partial_publish");
const frames = [{ valid_at: chunk.times[0], values: [1, null, 3, 4] }];
const published = await result("select publish_cams_grid($1,$2,$3,$4) result", [
  job.id,
  token,
  JSON.stringify(frames),
  "one",
]);
if (published.status !== "ready") throw Error("publish");
const values = (await pg.query("select values from cams_grid_frames")).rows[0]
  .values;
if (values[1] !== null) throw Error("null");
const again = await result("select claim_cams_grid($1,$2,$3,1) result", [
  slot.toISOString(),
  token,
  JSON.stringify(grid),
]);
if (again.status !== "not_due") throw Error("idempotent");
const rls = (
  await pg.query(
    "select count(*) n from pg_class where relname like 'cams_grid_%' and relkind='r' and relrowsecurity",
  )
).rows[0].n;
if (rls !== 6) throw Error("rls");
// An unchanged next six-hour slot must reuse the exact same generation.
const nextSlot = new Date(slot.getTime() + 6 * 3600000).toISOString();
const secondJob = await result("select claim_cams_grid($1,$2,$3,1) result", [
  nextSlot,
  token,
  JSON.stringify(grid),
]);
await result("select checkpoint_cams_grid($1,$2,0,$3) result", [
  secondJob.id,
  token,
  JSON.stringify(chunk),
]);
const dedup = await result("select publish_cams_grid($1,$2,$3,$4) result", [
  secondJob.id,
  token,
  JSON.stringify(frames),
  "one",
]);
if (dedup.generation_id !== published.generation_id)
  throw Error("identical_generation_not_reused");
if (
  (await pg.query("select count(*) n from cams_grid_generations")).rows[0].n !==
  1
)
  throw Error("duplicate_frames_retained");
// Expired leases can be recovered, but an older token cannot write afterwards.
const thirdSlot = new Date(slot.getTime() + 12 * 3600000).toISOString();
const third = await result("select claim_cams_grid($1,$2,$3,1) result", [
  thirdSlot,
  token,
  JSON.stringify(grid),
]);
await pg.query(
  "update cams_grid_jobs set lease_until=now()-interval '1 second' where id=$1",
  [third.id],
);
const reclaimed = await result("select claim_cams_grid($1,$2,$3,1) result", [
  thirdSlot,
  token2,
  JSON.stringify(grid),
]);
if (reclaimed.id !== third.id) throw Error("lease_recovery");
let staleRejected = false;
try {
  await result("select checkpoint_cams_grid($1,$2,0,$3) result", [
    third.id,
    token,
    JSON.stringify(chunk),
  ]);
} catch {
  staleRejected = true;
}
if (!staleRejected) throw Error("old_lease_wrote");
if (
  (await pg.query("select generation_id from cams_grid_active")).rows[0]
    .generation_id !== published.generation_id
)
  throw Error("staging_became_active");
await pg.exec("set role anon");
let denied = false;
try {
  await pg.query("select * from cams_grid_frames");
} catch {
  denied = true;
}
if (!denied) throw Error("anon");
console.log(
  "Grid SQL: migration, atomic claim, lease exclusion, invalid publication rollback, nulls, publish, idempotency and RLS passed",
);
await pg.close();
