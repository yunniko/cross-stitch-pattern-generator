import path from "node:path";
import { defineConfig } from "@playwright/test";

/**
 * The whole e2e suite against a server-processing build (G-034 M3).
 *
 * Two servers: the bundled processor, and a production Next build made with `NEXT_PUBLIC_PROCESSING=server` so the
 * editor routes generation and the photo preview through `/api` instead of its Web Workers. Its own ports, so it never
 * collides with the ordinary suite's server on 30200 (D102).
 *
 * Playwright loads this config as CommonJS, so `__dirname` is used here as in every other config in this folder;
 * `import.meta` is a syntax error under that loader.
 */

const PORT = 30201;
const PROCESSOR_PORT = 8102;
const ROOT = path.join(__dirname, "..");

export default defineConfig({
  testDir: path.join(ROOT, "tests", "e2e"),
  // Generation crosses a network hop and may queue behind another spec's job, so the ceiling is higher than D102's.
  timeout: 90_000,
  retries: 1,
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
  },
  webServer: [
    {
      command: "npm run build:processor && node dist/processor/server.mjs",
      cwd: ROOT,
      env: { PROCESSOR_PORT: String(PROCESSOR_PORT) },
      url: `http://127.0.0.1:${PROCESSOR_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      // Bound to loopback: this is a test server on a developer machine, and the default host would also serve it to
      // the local network. (The processor keeps its default binding: inside its container the app must reach it over
      // the Docker network, and its isolation comes from publishing no port at all.)
      command: `npm run build && npm run start -- -p ${PORT} -H 127.0.0.1`,
      cwd: ROOT,
      env: {
        NEXT_PUBLIC_PROCESSING: "server",
        PROCESSOR_URL: `http://127.0.0.1:${PROCESSOR_PORT}`,
        // The suite generates far more often than a person does; the real limits are covered in
        // tests/unit/request-guard.spec.ts, not by being refused here.
        RATE_LIMIT_JOBS_PER_MINUTE: "1000",
        RATE_LIMIT_PREVIEWS_PER_MINUTE: "1000",
      },
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
    },
  ],
});
