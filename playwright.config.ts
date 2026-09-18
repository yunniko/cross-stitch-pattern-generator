import { defineConfig } from "@playwright/test";

const PORT = 30200;
const PROCESSOR_PORT = 8102;

export default defineConfig({
  testDir: "./tests/e2e",
  // Generation, the photo preview and every export but the editable save cross a network hop to the processor
  // (G-034 M5), so the ceiling is higher than the 60 s D102 set when all of it ran in the page.
  timeout: 90_000,
  retries: 1,
  use: {
    // The app shell is a desktop-class docked layout; at Playwright's
    // 1280x720 default the Image window is too short and drag-and-drop
    // onto the canvas gets flaky. See D102.
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1440, height: 900 },
  },
  webServer: [
    {
      // The processor must be listening before the app serves a page that depends on it. `build:processor` also
      // copies the export font and texture next to the bundle (D153), so this is self-contained.
      command: "npm run build:processor && node dist/processor/server.mjs",
      env: { PROCESSOR_PORT: String(PROCESSOR_PORT) },
      url: `http://127.0.0.1:${PROCESSOR_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      // A production build on its own port, not `next dev`: Next 16 allows one
      // dev server per directory, so a developer's running dev server used to
      // block the whole suite. Locally an already-running `next start` on this
      // port is reused between iterations; CI always builds fresh. See D102.
      command: `npm run build && npm run start -- -p ${PORT} -H 127.0.0.1`,
      env: {
        PROCESSOR_URL: `http://127.0.0.1:${PROCESSOR_PORT}`,
        // The suite generates and exports far more often than a person does; the real limits are covered in
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
