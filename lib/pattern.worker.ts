import { applyDmcPalette } from "./dmc-match";
import { buildPattern } from "./pattern";
import { kMeansQuantizer, plainKMeansQuantizer } from "./quantize";
import type { PixelBuffer, StitchPattern } from "./types";

/**
 * "original" = the algorithm this project shipped with; "latest" = the
 * reinvestment-based fix (HANDOVER.md D20). Independent of `PaletteMode`
 * below (2026-09-11, HANDOVER.md D40/G-021) -- DMC-snapping used to be a
 * third value of this same enum ("dmc" always implying "latest"'s
 * clustering), which meant "Original" clustering could never be combined
 * with a real-thread palette. It never was a clustering algorithm in its
 * own right (the pre-existing comment already said so), just a palette
 * constraint the generation mode happened to gate.
 */
export type GenerationMode = "original" | "latest";

/**
 * "full" = whatever continuous colors the clustering algorithm above
 * produces; "dmc" = that same output with `applyDmcPalette` snapping every
 * color to the nearest real, buyable DMC thread color afterward (G-013) --
 * a palette constraint, applicable to either `GenerationMode`.
 */
export type PaletteMode = "full" | "dmc";

export interface StartMessage {
  type: "start";
  jobId: number;
  imageData: PixelBuffer;
  longerSideStitches: number;
  colorCount: number;
  generationMode?: GenerationMode;
  paletteMode?: PaletteMode;
}

export type WorkerRequest = StartMessage;

export type WorkerResponse =
  | { type: "progress"; jobId: number; fraction: number }
  | { type: "done"; jobId: number; pattern: StitchPattern }
  | { type: "error"; jobId: number; message: string };

// TypeScript's "dom" and "webworker" libs can't coexist in one tsconfig
// (both declare `self`/`postMessage` incompatibly) — this file runs as a
// worker at build/runtime regardless, so a narrow local shim for just the
// two globals actually used avoids that conflict without touching the
// project-wide tsconfig (which every non-worker file still needs "dom" for).
declare const self: {
  postMessage(message: WorkerResponse): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
};

self.onmessage = (event) => {
  const msg = event.data;
  if (msg.type !== "start") return;

  try {
    const pattern = buildPattern(msg.imageData, {
      longerSideStitches: msg.longerSideStitches,
      colorCount: msg.colorCount,
      quantizer: msg.generationMode === "original" ? plainKMeansQuantizer : kMeansQuantizer,
      onProgress: (fraction) => self.postMessage({ type: "progress", jobId: msg.jobId, fraction }),
    });
    const finalPattern = msg.paletteMode === "dmc" ? applyDmcPalette(pattern) : pattern;
    self.postMessage({ type: "done", jobId: msg.jobId, pattern: finalPattern });
  } catch (err) {
    self.postMessage({ type: "error", jobId: msg.jobId, message: err instanceof Error ? err.message : "Unknown error" });
  }
};
