import path from "node:path";
import { defineConfig } from "vitest/config";

// `npm run compare:rust` -- runs scripts/rust-parity.ts (G-048) through Vitest for the same TypeScript/alias handling
// as the unit suite, like `npm run bench` (D105). Sequential and untimed-out: the large cases take minutes.
export default defineConfig({
  test: {
    include: ["scripts/rust-parity.ts"],
    testTimeout: 0,
    hookTimeout: 0,
    fileParallelism: false,
    reporters: ["verbose"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
