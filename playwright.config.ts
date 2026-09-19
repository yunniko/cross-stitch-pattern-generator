import { defineConfig } from "@playwright/test";
import { appWithProcessor } from "./scripts/playwright-servers";

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
  webServer: appWithProcessor({ port: PORT, processorPort: PROCESSOR_PORT, reuseExistingServer: !process.env.CI }),
});
