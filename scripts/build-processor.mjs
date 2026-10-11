import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "rolldown";

/**
 * Bundles the processor into one self-contained ESM entry (G-034 M2), so the runtime image carries it without a
 * TypeScript toolchain or the app's whole dependency tree. It shares the request validation and the chart parser with
 * the app by importing the same modules; the generation and the exports are the `cs-job` binary it spawns (D221).
 *
 * `@napi-rs/canvas` stays external: it is a native addon, so it is installed in the image rather than bundled (D150).
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "dist", "processor");

// Cleared first: rolldown leaves the previous build's hashed chunks behind, and a directory holding two generations of
// them makes it impossible to tell by eye which bundle is actually deployed.
await rm(OUT, { recursive: true, force: true });

await build({
  // One entry: jobs run in `cs-job` processes the server spawns itself, not in worker threads (D407).
  input: { server: path.join(ROOT, "processor", "server.ts") },
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
