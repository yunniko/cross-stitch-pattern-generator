import { offscreenCanvas2dSupported } from "./canvas-backend";
import { runExportJob, type ExportJobRequest, type ExportJobResult } from "./export-jobs";
import type { ExportProgress } from "./export-progress";

/**
 * The export worker (G-035 M2, D125): renders, encodes and zips raster and PDF exports into `OffscreenCanvas`, so the
 * page never freezes while an export is built. Replies "unsupported" when this browser's workers lack OffscreenCanvas
 * 2D, and the client then runs the same job on the main thread.
 */
export type ExportWorkerRequest = { type: "export"; jobId: number; request: ExportJobRequest };

export type ExportWorkerResponse =
  | { type: "progress"; jobId: number; progress: ExportProgress }
  | { type: "done"; jobId: number; result: ExportJobResult }
  | { type: "unsupported"; jobId: number }
  | { type: "error"; jobId: number; message: string };

// A narrow local shim, as in pattern.worker.ts: the "dom" and "webworker" libs can't share one tsconfig.
declare const self: {
  postMessage(message: ExportWorkerResponse): void;
  onmessage: ((event: MessageEvent<ExportWorkerRequest>) => void) | null;
};

self.onmessage = (event) => {
  const { jobId, request } = event.data;
  if (!offscreenCanvas2dSupported()) {
    self.postMessage({ type: "unsupported", jobId });
    return;
  }
  runExportJob(request, (progress) => self.postMessage({ type: "progress", jobId, progress }))
    .then((result) => self.postMessage({ type: "done", jobId, result }))
    .catch((err: unknown) => self.postMessage({ type: "error", jobId, message: err instanceof Error ? err.message : "Couldn't complete that export." }));
};
