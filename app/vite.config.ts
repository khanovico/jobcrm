import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

import { agentInstructionAssetsPlugin } from "./vite-plugin-agent-instructions";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const appOrigin = env.VITE_APP_ORIGIN ?? "http://localhost:5173";
  const apiOrigin = env.VITE_API_URL ?? "http://localhost:8511";

  return {
    plugins: [
      react(),
      agentInstructionAssetsPlugin({ appOrigin, apiOrigin }),
    ],
    server: {
      allowedHosts: ["crm.apadcode.com"],
    },
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
      testTimeout: 30000,
      exclude: ["**/node_modules/**", "**/e2e/**", "**/dist/**"],
    },
  };
});
