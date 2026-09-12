import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.spec.ts"],
    // pdfjs-dist's dynamic import (used by pattern-keeper-pdf.spec.ts and
    // pdf-canvas-adapter.spec.ts to verify real text extraction) is slow on
    // its first invocation in a worker process -- reproducibly timed out at
    // the default 5000ms under full-suite parallel load (rotating between
    // whichever pdfjs-dependent file's worker warms up last), even though
    // each file passes in well under a second when run alone. G-026 M2,
    // HANDOVER.md D74.
    testTimeout: 15000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
