import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

// `npm run bench:chart` (G-036): large-chart interaction timings in scripts/bench-chart.spec.ts. Same production-build
// server and port as the e2e suite (D102), one worker, no retries. Output goes to the OS temp folder. Not run in CI.
const PORT = 30200;

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
  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    cwd: path.join(__dirname, ".."),
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 600_000,
  },
});
