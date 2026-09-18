import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

// `npm run bench:chart` (G-036): large-chart interaction timings in scripts/bench-chart.spec.ts. Same production-build
// server and port as the e2e suite (D102), one worker, no retries. Output goes to the OS temp folder. Not run in CI.
const PORT = 30200;
const PROCESSOR_PORT = 8102;

export default defineConfig({
  testDir: __dirname,
  testMatch: /bench-chart\.spec\.ts$/,
  outputDir: path.join(os.tmpdir(), "cross-stitch-bench-chart", "downloads"),
  timeout: 3_600_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  },
  // Generation runs on the processor since G-034, so the bench starts it too and tells the app where it is -- the same
  // pair the e2e suite starts (playwright.config.ts). Without it every Generate press fails.
  webServer: [
    {
      command: "npm run build:processor && node dist/processor/server.mjs",
      cwd: path.join(__dirname, ".."),
      env: { PROCESSOR_PORT: String(PROCESSOR_PORT) },
      url: `http://127.0.0.1:${PROCESSOR_PORT}/health`,
      reuseExistingServer: true,
      timeout: 180_000,
    },
    {
      command: `npm run build && npm run start -- -p ${PORT} -H 127.0.0.1`,
      cwd: path.join(__dirname, ".."),
      env: {
        PROCESSOR_URL: `http://127.0.0.1:${PROCESSOR_PORT}`,
        RATE_LIMIT_JOBS_PER_MINUTE: "1000",
        RATE_LIMIT_PREVIEWS_PER_MINUTE: "1000",
      },
      url: `http://localhost:${PORT}`,
      reuseExistingServer: true,
      timeout: 600_000,
    },
  ],
});
