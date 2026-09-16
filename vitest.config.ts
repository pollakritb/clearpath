import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    include: ["frontend/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      // Deliberately measure every tested pure/view-model module. Network,
      // browser-session and React hook boundaries are expanded separately as
      // their isolated tests are added; the report must not imply whole-app
      // coverage until those scopes are included.
      include: [
        "frontend/lib/{api-client,aqi,camera,dashboard,demo-community,forecast-presentation,idw,local-air,reporter-profile,source-kind,station-clusters,supabase}.ts",
        "frontend/hooks/*.ts",
        "frontend/components/auth/AuthProvider.tsx",
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        statements: 90,
        branches: 85,
      },
    },
  },
});
