import { defineConfig, devices } from "@playwright/test";

const isWindows = process.platform === "win32";
const python = isWindows ? ".venv\\Scripts\\python.exe" : "python";
const isCi = Boolean(process.env.CI);
const frontendPort = isCi ? 3000 : 3100;
const backendPort = 8000;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: isCi ? 2 : 0,
  reporter: isCi ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${frontendPort}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: `${python} -m uvicorn backend.main:app --host 127.0.0.1 --port ${backendPort}`,
      url: `http://127.0.0.1:${backendPort}/api/health`,
      reuseExistingServer: !isCi,
      timeout: 120_000,
      env: {
        ...process.env,
        APP_ENVIRONMENT: "test",
        LOCAL_DEMO_MODE: "true",
        CAPTURE_SESSION_SECRET: "e2e-capture-secret-at-least-32-bytes",
        OPENAI_API_KEY: "",
        PUSH_ENABLED: "false",
      },
    },
    {
      command: `npm run build && npm run start -- --hostname 127.0.0.1 --port ${frontendPort}`,
      url: `http://127.0.0.1:${frontendPort}`,
      reuseExistingServer: !isCi,
      timeout: 120_000,
      env: {
        ...process.env,
        BACKEND_ORIGIN: `http://127.0.0.1:${backendPort}`,
        ENABLE_LOCAL_API_PROXY: "true",
      },
    },
  ],
  projects: [
    {
      name: "mobile-360",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 360, height: 800 },
      },
    },
    {
      name: "mobile-390",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "mobile-430",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 430, height: 932 },
      },
    },
  ],
});
