import { defineConfig } from "@playwright/test";

const PORT = 30200;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  retries: 1,
  use: {
    baseURL: `http://localhost:${PORT}`,
    // G-012's app shell is a desktop-class docked layout (Tools/Colors/
    // Processing-params docks around a central Image window) -- it's
    // designed for, and only claims to support, a real desktop viewport,
    // not Playwright's cramped 1280x720 default. At the default size the
    // shell's chrome (header/mode-bar/processing-params dock/footer)
    // leaves too little vertical room for the Image window, which made
    // drag-and-drop interactions onto the canvas flaky (the drop target
    // ended up scrolled partly under the fixed chrome above it).
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    command: `npm run dev -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
