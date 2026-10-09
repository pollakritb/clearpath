import { spawnSync } from "node:child_process";

const attempts = 2;
const transientPatterns = [
  "audit endpoint returned an error",
  "503 service unavailable",
  "eai_again",
  "econnreset",
  "etimedout",
  "socket hang up",
];

const knownDevOnlyAdvisory =
  "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm";
const knownDevOnlyPackages = new Set([
  "braces",
  "micromatch",
  "fast-glob",
  "@next/eslint-plugin-next",
  "eslint-config-next",
]);

function runAudit({ omitDev = false } = {}) {
  const isWindows = process.platform === "win32";
  const command = isWindows ? (process.env.ComSpec ?? "cmd.exe") : "npm";
  const args = isWindows
    ? [
        "/d",
        "/s",
        "/c",
        `npm audit --json --audit-level=high${omitDev ? " --omit=dev" : ""}`,
      ]
    : [
        "audit",
        "--json",
        "--audit-level=high",
        ...(omitDev ? ["--omit=dev"] : []),
      ];

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = spawnSync(command, args, {
      encoding: "utf8",
      timeout: 120_000,
    });
    let report;
    try {
      report = JSON.parse(result.stdout ?? "");
    } catch {
      report = null;
    }
    const failure = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${result.error?.message ?? ""}`;
    const transientFailure = transientPatterns.some((pattern) =>
      failure.toLowerCase().includes(pattern),
    );
    if (report?.vulnerabilities && !transientFailure) {
      return { report, status: result.status };
    }
    if (attempt < attempts && transientFailure) {
      console.warn(
        `npm audit registry failure; retrying (${attempt}/${attempts})`,
      );
      continue;
    }
    process.stderr.write(result.stderr ?? "");
    console.error(
      "::error title=npm audit unavailable::Could not read npm audit results",
    );
    process.exit(1);
  }
}

const production = runAudit({ omitDev: true });
if (production.status !== 0) {
  console.error(
    "::error title=Production dependency audit failed::",
    production.report.vulnerabilities,
  );
  process.exit(1);
}

const full = runAudit();
if (full.status === 0) {
  console.log("npm audit passed: no high or critical vulnerabilities");
  process.exit(0);
}

const vulnerabilities = Object.entries(full.report.vulnerabilities);
const advisoryUrls = new Set(
  vulnerabilities.flatMap(([, issue]) =>
    issue.via
      .filter((via) => typeof via === "object" && via !== null)
      .map((via) => via.url),
  ),
);
const onlyKnownUnpatchedDevAdvisory =
  vulnerabilities.length > 0 &&
  vulnerabilities.every(([name]) => knownDevOnlyPackages.has(name)) &&
  advisoryUrls.size === 1 &&
  advisoryUrls.has(knownDevOnlyAdvisory);

if (onlyKnownUnpatchedDevAdvisory) {
  console.warn(
    `::warning title=Unpatched development-only dependency::${knownDevOnlyAdvisory} is confined to the ESLint toolchain; production dependencies passed audit. New advisories still fail this gate.`,
  );
  process.exit(0);
}

console.error(
  "::error title=Dependency audit failed::",
  full.report.vulnerabilities,
);
process.exit(1);
