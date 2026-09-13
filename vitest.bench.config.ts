import path from "node:path";
import { defineConfig } from "vitest/config";

// `npm run bench` -- runs scripts/bench.ts through Vitest so it gets the
// same TypeScript/alias handling as the unit suite with no extra runner
// dependency (D103). Sequential and untimed-out: the large case alone
// took ~170 s before G-031 M3.
export default defineConfig({
  test: {
    include: ["scripts/bench.ts"],
    testTimeout: 0,
    hookTimeout: 0,
    fileParallelism: false,
    reporters: ["verbose"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
