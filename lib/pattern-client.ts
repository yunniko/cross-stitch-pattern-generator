import type { PixelBuffer, StitchPattern } from "./types";
import type { EdgeMode, GenerationMode, PaletteMode, WorkerRequest, WorkerResponse } from "./pattern.worker";

export interface RunPatternJobOptions {
  imageData: PixelBuffer;
  longerSideStitches: number;
  colorCount: number;
  generationMode?: GenerationMode;
  paletteMode?: PaletteMode;
  edgeMode?: EdgeMode;
  onProgress?: (fraction: number) => void;
}

let worker: Worker | null = null;
let jobCounter = 0;
let activeJobId: number | null = null;
let activeReject: ((reason: unknown) => void) | null = null;

/** Thrown to reject a job's promise when it's superseded or explicitly cancelled, rather than leaving that promise pending forever. */
export class PatternJobCancelledError extends Error {
  constructor() {
    super("Pattern generation was cancelled");
    this.name = "PatternJobCancelledError";
  }
}

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./pattern.worker.ts", import.meta.url));
  }
  return worker;
}

/**
 * Cancels any in-flight job. Cancellation is blunt (terminate + recreate)
 * rather than cooperative: `buildPattern`'s hot loops aren't checkpointed
 * for interruption. The cancelled job's promise is rejected with
 * `PatternJobCancelledError` rather than left pending forever. A worker
 * with no job in flight is left alone, so the next Generate reuses it and
 * its module-level caches (review E6).
 */
export function cancelPatternJob(): void {
  if (activeJobId === null) return;
  if (worker) {
    worker.terminate();
    worker = null;
  }
  activeJobId = null;
  if (activeReject) {
    const reject = activeReject;
    activeReject = null;
    reject(new PatternJobCancelledError());
  }
}

/** Runs pattern generation in a Web Worker so the UI thread stays responsive (D6). One job at a time: a new request supersedes an in-flight one. */
export function runPatternJob(options: RunPatternJobOptions): Promise<StitchPattern> {
  cancelPatternJob();
  const jobId = ++jobCounter;
  activeJobId = jobId;
  const w = getWorker();

  return new Promise((resolve, reject) => {
    activeReject = reject;

    w.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (msg.jobId !== jobId || jobId !== activeJobId) return; // stale response from a superseded job
      if (msg.type === "progress") {
        options.onProgress?.(msg.fraction);
      } else if (msg.type === "done") {
        activeJobId = null;
        activeReject = null;
        resolve(msg.pattern);
      } else if (msg.type === "error") {
        activeJobId = null;
        activeReject = null;
        reject(new Error(msg.message));
      }
    };
    w.onerror = (event) => {
      if (jobId !== activeJobId) return;
      activeJobId = null;
      activeReject = null;
      reject(new Error(event.message || "Pattern generation failed"));
    };

    const request: WorkerRequest = {
      type: "start",
      jobId,
      imageData: options.imageData,
      longerSideStitches: options.longerSideStitches,
      colorCount: options.colorCount,
      generationMode: options.generationMode,
      paletteMode: options.paletteMode,
      edgeMode: options.edgeMode,
    };
    w.postMessage(request);
  });
}
