import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";
import { appWithProcessor } from "./playwright-servers";

// `npm run bench:browser` (G-035): the browser timing benchmark in scripts/bench-browser.spec.ts. Same production-build
// server and port as the e2e suite (D102), one worker, no retries, long timeouts. Downloads go to the OS temp folder,
// never the project tree. Not run in CI.
const PORT = 30200;
const PROCESSOR_PORT = 8102;

export default defineConfig({
  testDir: __dirname,
  testMatch: /bench-browser\.spec\.ts$/,
  outputDir: path.join(os.tmpdir(), "cross-stitch-bench-browser", "downloads"),
  timeout: 1_800_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  },
  webServer: appWithProcessor({ port: PORT, processorPort: PROCESSOR_PORT, reuseExistingServer: true, appTimeoutMs: 600_000 }),
});
