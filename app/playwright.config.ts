import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

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
      command: `bash -lc 'cd "${path.join(repoRoot, "crm")}" && USE_MEMORY_REPOSITORY=true python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000'`,
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
