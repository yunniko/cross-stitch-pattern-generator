import { defineConfig } from "@playwright/test";
import os from "node:os";
import path from "node:path";

// Compares two already-running builds (see scripts/screen-compare.spec.ts); starts no server of its own.
export default defineConfig({
  testDir: ".",
  testMatch: /screen-compare\.spec\.ts$/,
  outputDir: path.join(os.tmpdir(), "cross-stitch-screen-compare"),
  timeout: 600_000,
  workers: 1,
  reporter: [["list"]],
});
