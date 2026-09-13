import { defineConfig } from "@playwright/test";

const PORT = 30200;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  retries: 1,
  use: {
    baseURL: `http://localhost:${PORT}`,
    // The app shell is a desktop-class docked layout; at Playwright's
    // 1280x720 default the Image window is too short and drag-and-drop
    // onto the canvas gets flaky. See D102.
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    // A production build on its own port, not `next dev`: Next 16 allows one
    // dev server per directory, so a developer's running dev server used to
    // block the whole suite. Locally an already-running `next start` on this
    // port is reused between iterations; CI always builds fresh. See D102.
    command: `npm run build && npm run start -- -p ${PORT}`,
    // Offers the photo-enhancement modes that aren't released yet, so their UI is tested before release. Production
    // builds never set this (D116).
    env: { ...process.env, NEXT_PUBLIC_ENHANCEMENT_PREVIEW: "1" } as Record<string, string>,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
