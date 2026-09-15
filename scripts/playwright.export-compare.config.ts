import { defineConfig } from "@playwright/test";
import os from "node:os";
import path from "node:path";

// Compares exports from two already-running builds (see scripts/export-compare.spec.ts); starts no server of its own.
export default defineConfig({
  testDir: ".",
  testMatch: /export-compare\.spec\.ts$/,
  outputDir: path.join(os.tmpdir(), "cross-stitch-export-compare"),
  timeout: 1_200_000,
  workers: 1,
  reporter: [["list"]],
});
