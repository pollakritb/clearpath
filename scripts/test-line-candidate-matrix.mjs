// Independent real-PostgreSQL differential matrix: 1,000 source-selection queries.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const pg = new PGlite();
await pg.exec(`create table stations(id text,name_th text,pm25 float8,lat float8,lon float8,recorded_at timestamptz);
create table community_reports(id bigint,status text,pm25 float8,lat float8,lon float8,public_lat float8,public_lon float8,captured_at timestamptz);`);
const migration = readFileSync(
  "supabase/migrations/20261113060929_line_nearest_pin_notifications.sql",
  "utf8",
);
const start = migration.indexOf("create function public.air_alert_candidates(");
const end = migration.indexOf("$$;", start) + 3;
assert(start > 0 && end > start);
await pg.exec(migration.slice(start, end));
let count = 0;
for (const kind of ["station", "community"])
  for (const age of [0, 3599, 3601, 10799, 10801])
    for (const value of [0, 20, 37.6, 75, 100])
      for (const radius of [1, 2, 3, 5, 8, 10, 15, 20, 30, 50]) {
        for (const approved of [true, false]) {
          const lat = 7 + (count % 140) / 10,
            lon = 98 + (count % 70) / 10;
          const distance = (a, b) => {
            const r = Math.PI / 180,
              d = (a - lat) * r,
              e = (b - lon) * r;
            const q =
              Math.sin(d / 2) ** 2 +
              Math.cos(lat * r) * Math.cos(a * r) * Math.sin(e / 2) ** 2;
            return 6371.0088 * 2 * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
          };
          await pg.exec(
            "begin;delete from stations;delete from community_reports;",
          );
          await pg.query(
            "insert into stations values('far','far-high',150,$1,$2,now())",
            [lat + 0.02, lon],
          );
          if (kind === "station")
            await pg.query(
              "insert into stations values('near','near',$1,$2,$3,now()-$4*interval '1 second')",
              [value, lat + 0.004, lon, age],
            );
          else
            await pg.query(
              "insert into community_reports values(1,$1,$2,40,120,$3,$4,now()-$5*interval '1 second')",
              [
                approved ? "approved" : "rejected",
                value,
                lat + 0.004,
                lon,
                age,
              ],
            );
          const rows = (
            await pg.query("select air_alert_candidates($1,$2,$3) candidates", [
              lat,
              lon,
              radius,
            ])
          ).rows[0].candidates;
          const nearValid =
            age <= (kind === "station" ? 3600 : 10800) &&
            (kind === "station" || approved);
          const expected = nearValid
            ? kind
            : distance(lat + 0.02, lon) <= radius
              ? "station"
              : null;
          // SQL returns one bounding-box nearest; Python rejects any final outside-radius point.
          const actual =
            rows[0] && rows[0].distance_km <= radius ? rows[0] : null;
          assert.equal(actual?.source_type ?? null, expected, `case ${count}`);
          if (nearValid) {
            assert.equal(actual.pm25, value);
            assert(Math.abs(actual.lat - (lat + 0.004)) < 1e-10);
          }
          if (actual)
            assert(
              Math.abs(actual.distance_km - distance(actual.lat, actual.lon)) <
                1e-7,
            );
          await pg.exec("rollback");
          count++;
        }
      }
assert.equal(count, 1000);
console.log(
  `PostgreSQL candidate matrix: ${count} distinct cases passed; freshness/status/public coordinates/radius/nearest-before-threshold`,
);
await pg.close();
