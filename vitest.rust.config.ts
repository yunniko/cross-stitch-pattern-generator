import path from "node:path";
import { defineConfig } from "vitest/config";

// The runs that need the Rust binary: the golden hashes against `cs-bench`, and the processor specs that drive a
// real job. Through Vitest for the same alias handling as the unit suite. Sequential and untimed-out.
export default defineConfig({
  test: {
    include: [
      "scripts/rust-goldens.ts",
      "scripts/rust-backstitch-oxs.ts",
      "scripts/rust-backstitch-style.ts",
      "scripts/rust-photo-adjust.ts",
      "scripts/rust-photo-adjust-pipeline.ts",
      "scripts/rust-enhancement-gates.ts",
      "scripts/rust-enhance-parity.ts",
      "tests/unit/processor-export-pool.spec.ts",
      "tests/unit/processor-pool-limits.spec.ts",
      "tests/unit/processor-pool-parity.spec.ts",
    ],
    testTimeout: 0,
    hookTimeout: 0,
    fileParallelism: false,
    reporters: ["verbose"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
