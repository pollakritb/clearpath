// Local QA only: real Postgres SQL/migration, no remote database credentials.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
const artifact = JSON.parse(readFileSync(process.argv[2], "utf8"));
const port = Number(process.argv[3] ?? 8087);
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
const slot = new Date();
slot.setUTCHours(Math.floor(slot.getUTCHours() / 6) * 6, 0, 0, 0);
const job = (
  await pg.query("select claim_cams_grid($1,$2,$3,1) result", [
    slot.toISOString(),
    token,
    JSON.stringify(artifact.grid),
  ])
).rows[0].result;
await pg.query("select checkpoint_cams_grid($1,$2,0,$3)", [
  job.id,
  token,
  JSON.stringify({ times: artifact.frames.map((f) => f.valid_at), cells: [] }),
]);
await pg.query("select publish_cams_grid($1,$2,$3,$4)", [
  job.id,
  token,
  JSON.stringify(artifact.frames),
  artifact.fingerprint,
]);
await pg.query(
  "update cams_grid_generations set started_at=$1,retrieved_at=$2 where id=$3",
  [artifact.started_at, artifact.retrieved_at, job.generation_id],
);
const tables = new Set([
  "cams_grid_active",
  "cams_grid_generations",
  "cams_grid_definitions",
  "cams_grid_frames",
]);
const columns = new Set([
  "generation_id",
  "grid_id",
  "id",
  "status",
  "valid_at",
]);
const server = createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      res.end("ready");
      return;
    }
    if (req.method !== "POST" || req.url !== "/read") {
      res.writeHead(404);
      res.end();
      return;
    }
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 10000) throw Error("size");
    }
    const q = JSON.parse(body);
    if (!tables.has(q.table)) throw Error("table");
    const fields =
      q.fields === "*"
        ? "*"
        : q.fields
            .split(",")
            .map((f) => {
              if (
                !["generation_id", "valid_at", "values", "payload"].includes(f)
              )
                throw Error("column");
              return '"' + f + '"';
            })
            .join(",");
    const params = [];
    const where = (q.filters ?? [])
      .map(([column, op, value]) => {
        if (!columns.has(column) || !["=", ">=", "<="].includes(op))
          throw Error("filter");
        params.push(value);
        return '"' + column + '"' + op + "$" + params.length;
      })
      .join(" AND ");
    let sql = `select ${fields} from "${q.table}"${where ? " where " + where : ""}`;
    if (q.order) {
      if (!columns.has(q.order)) throw Error("order");
      sql += ' order by "' + q.order + '"';
    }
    sql += " limit " + Math.min(100, Math.max(1, Number(q.limit) || 100));
    const result = await pg.query(sql, params);
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(result.rows));
  } catch {
    res.writeHead(400);
    res.end('{"error":"local_grid_query_failed"}');
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`Local Postgres grid ready on 127.0.0.1:${port}`),
);
process.on("SIGTERM", () =>
  server.close(async () => {
    await pg.close();
    process.exit(0);
  }),
);
