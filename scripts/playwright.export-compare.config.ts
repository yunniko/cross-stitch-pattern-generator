import { defineConfig } from "@playwright/test";
import os from "node:os";
import path from "node:path";

// Compares exports from two already-running builds (see scripts/export-compare.spec.ts); starts no server of its own.
// Each build must run with its own processor and be told where it is (`PROCESSOR_URL`): every spec here presses
// Generate, and generation runs on the processor since G-034. `scripts/playwright-servers.ts` is the pair to start.
export default defineConfig({
  testDir: ".",
  testMatch: /export-compare\.spec\.ts$/,
  outputDir: path.join(os.tmpdir(), "cross-stitch-export-compare"),
  timeout: 1_200_000,
  workers: 1,
  reporter: [["list"]],
});
