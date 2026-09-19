import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

/**
 * Compares exports from a browser-processing build against a server-processing one (G-034 M4, criterion 7).
 * Starts no server of its own: both builds must already be running, as in `playwright.export-compare.config.ts`, each
 * with its own processor and `PROCESSOR_URL` (`scripts/playwright-servers.ts`). G-034 M5 removed the browser-processing
 * path, so both sides are server builds now: this compares two commits' exports, not two processing locations.
 *
 *   BROWSER_URL=http://127.0.0.1:30200 SERVER_URL=http://127.0.0.1:30201 npm run compare:export-parity
 */
export default defineConfig({
  testDir: __dirname,
  testMatch: /export-parity\.spec\.ts$/,
  outputDir: path.join(os.tmpdir(), "cross-stitch-export-parity"),
  timeout: 1_800_000,
  workers: 1,
  reporter: [["list"]],
});
