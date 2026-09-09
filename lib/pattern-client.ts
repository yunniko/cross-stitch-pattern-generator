import type { PixelBuffer, StitchPattern } from "./types";
import type { GenerationMode, WorkerRequest, WorkerResponse } from "./pattern.worker";

export interface RunPatternJobOptions {
  imageData: PixelBuffer;
  longerSideStitches: number;
  colorCount: number;
  generationMode?: GenerationMode;
  onProgress?: (fraction: number) => void;
}

let worker: Worker | null = null;
let jobCounter = 0;
let activeJobId: number | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./pattern.worker.ts", import.meta.url));
  }
  return worker;
}

/**
 * Cancels any in-flight job. Cancellation is blunt (terminate + recreate)
 * rather than cooperative — `buildPattern`'s hot loops (k-means, the local
 * optimizer) aren't checkpointed for interruption, and adding that would be
 * real complexity this app's single-job-at-a-time UI doesn't need yet.
 */
export function cancelPatternJob(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  activeJobId = null;
}

/** Runs pattern generation in a Web Worker so the UI thread stays responsive during k-means/local-optimizer passes (HANDOVER.md D6). */
export function runPatternJob(options: RunPatternJobOptions): Promise<StitchPattern> {
  cancelPatternJob(); // only one job makes sense at a time for this UI; a new request supersedes the old one
  const jobId = ++jobCounter;
  activeJobId = jobId;
  const w = getWorker();

  return new Promise((resolve, reject) => {
    w.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      if (msg.jobId !== jobId || jobId !== activeJobId) return; // stale response from a superseded job
      if (msg.type === "progress") {
        options.onProgress?.(msg.fraction);
      } else if (msg.type === "done") {
        resolve(msg.pattern);
      } else if (msg.type === "error") {
        reject(new Error(msg.message));
      }
    };
    w.onerror = (event) => {
      if (jobId !== activeJobId) return;
      reject(new Error(event.message || "Pattern generation failed"));
    };

    const request: WorkerRequest = {
      type: "start",
      jobId,
      imageData: options.imageData,
      longerSideStitches: options.longerSideStitches,
      colorCount: options.colorCount,
      generationMode: options.generationMode,
    };
    w.postMessage(request);
  });
}
