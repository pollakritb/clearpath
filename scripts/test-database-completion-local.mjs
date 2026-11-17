// Fixed local SQL rehearsals only. No hosted commands or credentials are used.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const checks = [
  "test-cams-retention-delta.mjs",
  "test-operational-display-references.mjs",
  "test-unified-cams.mjs",
  "test-numeric-identifiers.mjs",
  "test-account-erasure.mjs",
  "test-community-trust.mjs",
  "test-contribution-v3.mjs",
  "test-line-delivery.mjs",
  "test-legacy-audit-retention.mjs",
];
const started = new Date().toISOString();
const results = [];
for (const name of checks) {
  const time = performance.now();
  // Do not propagate hosted tokens, database URLs, NODE_OPTIONS or send flags.
  const env = Object.fromEntries(
    ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "TZ", "SYSTEMROOT"]
      .filter((key) => process.env[key] !== undefined)
      .map((key) => [key, process.env[key]]),
  );
  const result = spawnSync(process.execPath, [join(root, "scripts", name)], {
    cwd: root,
    env,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  const passed = result.status === 0 && !result.error;
  const item = {
    name,
    passed,
    exit_code: result.status,
    elapsed_ms: Math.round(performance.now() - time),
    detail: passed
      ? result.stdout.trim().slice(-4000)
      : (result.error?.message ?? result.stderr ?? "unknown failure").slice(
          -4000,
        ),
  };
  results.push(item);
  console.log(`${passed ? "PASS" : "FAIL"}: ${name} (${item.elapsed_ms}ms)`);
}
const directory = join(
  tmpdir(),
  `clearpath-local-db-${started.replace(/[:.]/g, "-")}`,
);
mkdirSync(directory, { mode: 0o700 });
const report = join(directory, "results.json");
const passed = results.every((item) => item.passed);
writeFileSync(
  report,
  JSON.stringify(
    {
      started_at: started,
      completed_at: new Date().toISOString(),
      kind: "isolated-synthetic-sql-rehearsal-not-production-restore",
      production_commands: false,
      passed,
      results,
    },
    null,
    2,
  ) + "\n",
  { mode: 0o600, flag: "wx" },
);
console.log(`Local report: ${report}`);
if (!passed) process.exitCode = 1;
