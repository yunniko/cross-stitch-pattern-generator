import { buildPattern, type PaletteMode } from "./pattern";
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

// Re-exported from pattern.ts (not defined here) as of G-020 M5
// (HANDOVER.md D56): applying the DMC snap now happens inside
// `buildPattern` itself, since re-optimizing against the new palette
// needs the same internal `cells`/`importance`/`pairEvidence` context
// only `buildPattern` has in scope.
export type { PaletteMode };

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
      paletteMode: msg.paletteMode,
      onProgress: (fraction) => self.postMessage({ type: "progress", jobId: msg.jobId, fraction }),
    });
    self.postMessage({ type: "done", jobId: msg.jobId, pattern });
  } catch (err) {
    self.postMessage({ type: "error", jobId: msg.jobId, message: err instanceof Error ? err.message : "Unknown error" });
  }
};
