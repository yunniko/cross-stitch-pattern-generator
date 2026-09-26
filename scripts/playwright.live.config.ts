import { defineConfig } from "@playwright/test";

/**
 * The deployed site, not a local build: no `webServer`, and the base URL is the live one.
 *
 * Used to verify a deploy by driving the thing that is actually serving readers, rather than a build that
 * happens to come from the same commit. Only specs that make no assumption about a local fixture path or a
 * local processor belong here.
 */
export default defineConfig({
  testDir: "../tests/e2e",
  timeout: 120_000,
  retries: 1,
  use: {
    baseURL: process.env.LIVE_URL ?? "https://cross-stitch.craftodejnice.cz",
    viewport: { width: 1440, height: 900 },
  },
});
