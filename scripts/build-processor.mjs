import { cp, rm } from "node:fs/promises";
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

/**
 * The export font and the stitch texture travel with the bundle (D153). Copied here rather than only in the
 * Dockerfile, so `dist/processor` is self-contained wherever it runs: the image, a test, or a local processor. Leaving
 * this to the image alone meant every local export failed with a missing font.
 */
await cp(path.join(ROOT, "public", "fonts"), path.join(OUT, "assets", "fonts"), { recursive: true });
await cp(path.join(ROOT, "public", "stitch-texture.png"), path.join(OUT, "assets", "stitch-texture.png"));

console.log(`processor bundled to ${path.relative(ROOT, OUT)}, with its export assets`);
