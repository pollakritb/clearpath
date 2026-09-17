import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Non-source dirs (Python venv ships .js that must not be linted)
    "node_modules/**",
    ".venv/**",
    ".pytest_cache/**",
    ".pytest-*/**",
    ".playwright-mcp/**",
    "playwright-report/**",
    "test-results/**",
    "docs/eval/**",
    ".forecast-reset-backups/**",
    "data/private/**",
    "scripts/**.py",
  ]),
]);

export default eslintConfig;
