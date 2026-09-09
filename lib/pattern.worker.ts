import { buildPattern } from "./pattern";
import { kMeansQuantizer, plainKMeansQuantizer } from "./quantize";
import type { PixelBuffer, StitchPattern } from "./types";

/** "original" = the algorithm this project shipped with; "latest" = the reinvestment-based fix (HANDOVER.md D20). */
export type GenerationMode = "original" | "latest";

export interface StartMessage {
  type: "start";
  jobId: number;
  imageData: PixelBuffer;
  longerSideStitches: number;
  colorCount: number;
  generationMode?: GenerationMode;
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
    self.postMessage({ type: "done", jobId: msg.jobId, pattern });
  } catch (err) {
    self.postMessage({ type: "error", jobId: msg.jobId, message: err instanceof Error ? err.message : "Unknown error" });
  }
};
