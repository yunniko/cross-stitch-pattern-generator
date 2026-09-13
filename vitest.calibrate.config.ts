import path from "node:path";
import { defineConfig } from "vitest/config";

// `npm run calibrate:enhancement` -- runs scripts/calibrate-enhancement.ts through Vitest, like the bench (D105).
// Untimed: it builds dozens of patterns from full-size photos.
export default defineConfig({
  test: {
    include: ["scripts/calibrate-enhancement.ts"],
    testTimeout: 0,
    hookTimeout: 0,
    fileParallelism: false,
    reporters: ["verbose"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
