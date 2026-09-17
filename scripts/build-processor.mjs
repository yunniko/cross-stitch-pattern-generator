import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "rolldown";

/**
 * Bundles the processor into a self-contained ESM pair (G-034 M2).
 *
 * The processor shares the pipeline with the browser — `buildPattern`, the quantizers, the palette — by importing the
 * very same modules, which is what makes the golden hashes (D107) meaningful. Bundling lets the runtime image carry
 * those modules without a TypeScript toolchain or the app's whole dependency tree.
 *
 * `@napi-rs/canvas` stays external: it is a native addon, so it is installed in the image rather than bundled (D150).
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "dist", "processor");

// Cleared first: rolldown leaves the previous build's hashed chunks behind, and a directory holding two generations of
// them makes it impossible to tell by eye which bundle is actually deployed.
await rm(OUT, { recursive: true, force: true });

await build({
  input: {
    server: path.join(ROOT, "processor", "server.ts"),
    // Separate entries, not imports: each is spawned by path as a worker thread.
    "pool-worker": path.join(ROOT, "processor", "pool-worker.ts"),
    "preview-worker": path.join(ROOT, "processor", "preview-worker.ts"),
  },
  platform: "node",
  external: ["@napi-rs/canvas"],
  resolve: { alias: { "@": ROOT } },
  output: {
    dir: OUT,
    format: "esm",
    entryFileNames: "[name].mjs",
    chunkFileNames: "[name]-[hash].mjs",
  },
});

console.log(`processor bundled to ${path.relative(ROOT, OUT)}`);
