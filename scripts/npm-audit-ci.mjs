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

const isWindows = process.platform === "win32";
const npmCommand = isWindows ? (process.env.ComSpec ?? "cmd.exe") : "npm";
const npmArgs = isWindows
  ? ["/d", "/s", "/c", "npm audit --audit-level=high"]
  : ["audit", "--audit-level=high"];
let lastOutput = "";

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  const result = spawnSync(npmCommand, npmArgs, {
    encoding: "utf8",
    timeout: 120_000,
  });

  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  if (result.status === 0) {
    process.exit(0);
  }

  lastOutput = `${result.stdout ?? ""}\n${result.stderr ?? ""}\n${
    result.error?.message ?? ""
  }`.toLowerCase();
  const transientFailure = transientPatterns.some((pattern) =>
    lastOutput.includes(pattern),
  );
  if (!transientFailure) {
    process.exit(result.status ?? 1);
  }
  if (attempt < attempts) {
    console.warn(
      `npm audit registry failure; retrying (${attempt}/${attempts})`,
    );
  }
}

console.error(
  "::error title=npm audit unavailable::npm registry audit endpoint was unavailable after two attempts; refusing to pass the security gate",
);
process.exit(1);
