import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const e2eSeedEmail = "e2e-admin@example.com";
const e2eSeedPassword = "secret1234";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry"
  },
  webServer: [
    {
      command: `bash -lc 'cd "${repoRoot}" && source crm/.venv/bin/activate && cd crm && USE_MEMORY_REPOSITORY=true SEED_USER_EMAIL="${e2eSeedEmail}" SEED_USER_PASSWORD="${e2eSeedPassword}" SEED_USER_NAME="E2E Admin" SEED_USER_ROLE=admin python -m uvicorn app.main:app --host 127.0.0.1 --port 8000'`,
      url: "http://127.0.0.1:8000/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5173",
      cwd: path.join(repoRoot, "app"),
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    }
  ]
});
