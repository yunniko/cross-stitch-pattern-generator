import type { ThreadBrand } from "../threads/thread-brands";

/**
 * The vocabulary of a generation request: what a caller may ask for, separate from the code that does it.
 *
 * These lived in `pattern.ts` beside `buildPattern`. That meant one type-only import in `processor/job-protocol.ts`
 * held the entire TypeScript pipeline on the shipped import graph — every algorithm reachable from the app, for
 * three string unions. Splitting the words from the work is what let the implementation go (G-068 M3).
 */
/** "full" = whatever continuous colors the clustering algorithm produces; any `ThreadBrand` (only "dmc" so far, G-013) = that same output snapped to the nearest real, buyable thread color from that brand's line, with the fine local-optimizer pass re-run against the new fixed palette (G-020 M5, HANDOVER.md D56). Generalized from `"full" | "dmc"` in G-029 M1 (HANDOVER.md D92). */
export type PaletteMode = "full" | ThreadBrand;

/** "standard" = today's exact behavior (default). "crisp" = the G-024 Crisp Edges feature (HANDOVER.md D57-D71): preserves hard color boundaries the standard averaging pipeline would otherwise blend into a manufactured intermediate color. */
export type EdgeMode = "standard" | "crisp" | "crisp-plus";

/**
 * "original" = the algorithm this project shipped with; "latest" = the reinvestment-based fix (HANDOVER.md D20).
 * Independent of `PaletteMode` above (2026-09-11, D40/G-021) -- DMC-snapping used to be a third value of this same
 * enum ("dmc" always implying "latest"'s clustering), which meant "Original" clustering could never be combined with
 * a real-thread palette. It never was a clustering algorithm in its own right, just a palette constraint the
 * generation mode happened to gate.
 *
 * Declared here rather than beside the browser worker that used to own it, so it outlives that worker (G-034 M5).
 */
export type GenerationMode = "original" | "latest";

/** Crisp+ (G-038) runs every Crisp stage with its own evidence options, plus the passes that only it adds. */
export function isCrispEdgeMode(edgeMode: EdgeMode): edgeMode is "crisp" | "crisp-plus" {
  return edgeMode === "crisp" || edgeMode === "crisp-plus";
}
