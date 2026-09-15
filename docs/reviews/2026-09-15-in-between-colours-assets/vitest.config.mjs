import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// Runs these research scripts only: npx vitest run --config docs/reviews/2026-09-15-in-between-colours-assets/vitest.config.mjs
const config = {
  root: here,
  test: { include: ["*.spec.ts"], testTimeout: 600000 },
  resolve: { alias: { "@": path.resolve(here, "../../..") } },
};
export default config;
