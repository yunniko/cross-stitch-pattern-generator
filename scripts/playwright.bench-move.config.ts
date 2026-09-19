import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";
import { appWithProcessor } from "./playwright-servers";

// `npm run bench:move` (G-039): Move-drag timings in scripts/bench-move.spec.ts. Same production-build server as the
// e2e suite (D102) on its own port, one worker, no retries. Output goes to the OS temp folder. Not run in CI.
const PORT = 30210;
// Its own processor port too, so it never adopts the e2e suite's pair on 30200/8102.
const PROCESSOR_PORT = 8112;

export default defineConfig({
  testDir: __dirname,
  testMatch: /bench-move\.spec\.ts$/,
  outputDir: path.join(os.tmpdir(), "cross-stitch-bench-move", "downloads"),
  timeout: 3_600_000,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
  },
  webServer: appWithProcessor({ port: PORT, processorPort: PROCESSOR_PORT, reuseExistingServer: true, appTimeoutMs: 600_000 }),
});
