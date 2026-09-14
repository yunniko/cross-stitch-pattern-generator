import { offscreenCanvas2dSupported } from "./canvas-backend";
import { runExportJob, runsOnMainThread, type ExportJobRequest, type ExportJobResult } from "./export-jobs";
import type { ExportProgressCallback } from "./export-progress";
import type { ExportWorkerRequest, ExportWorkerResponse } from "./export.worker";

let worker: Worker | null = null;
let jobCounter = 0;

function discardWorker(): void {
  worker?.terminate();
  worker = null;
}

/**
 * Runs an export in the export worker so rendering, encoding and serializing never freeze the page (D125). Only the
 * editable JSON runs inline. Where Worker or OffscreenCanvas 2D is missing, or the worker reports it can't draw, the same
 * job runs on the main thread instead, yielding between pages (D079). A worker that fired a native error is discarded.
 */
export function runExport(request: ExportJobRequest, onProgress?: ExportProgressCallback): Promise<ExportJobResult> {
  if (runsOnMainThread(request.kind) || typeof Worker === "undefined" || !offscreenCanvas2dSupported()) {
    return runExportJob(request, onProgress);
  }

  const jobId = ++jobCounter;
  // Only the Export all bundle's editable JSON uses the embedded original photo, so other exports don't copy it across.
  const workerRequest: ExportJobRequest =
    request.kind === "all" || !request.pattern.sourceImage ? request : { ...request, pattern: { ...request.pattern, sourceImage: undefined } };

  return new Promise((resolve, reject) => {
    let w: Worker;
    try {
      worker ??= new Worker(new URL("./export.worker.ts", import.meta.url));
      w = worker;
    } catch {
      runExportJob(request, onProgress).then(resolve, reject);
      return;
    }

    // Handlers are detached once the job settles, so the idle worker doesn't keep this job's pattern and callbacks alive.
    const detach = () => {
      if (w.onmessage === onMessage) w.onmessage = null;
      if (w.onerror === onError) w.onerror = null;
    };
    const onMessage = (event: MessageEvent<ExportWorkerResponse>) => {
      const msg = event.data;
      if (msg.jobId !== jobId) return;
      if (msg.type === "progress") {
        onProgress?.(msg.progress);
        return;
      }
      detach();
      if (msg.type === "done") resolve(msg.result);
      else if (msg.type === "unsupported") runExportJob(request, onProgress).then(resolve, reject);
      else reject(new Error(msg.message));
    };
    const onError = (event: ErrorEvent) => {
      detach();
      discardWorker();
      reject(new Error(event.message || "Couldn't complete that export."));
    };
    w.onmessage = onMessage;
    w.onerror = onError;

    const message: ExportWorkerRequest = { type: "export", jobId, request: workerRequest };
    try {
      w.postMessage(message);
    } catch (error) {
      detach();
      reject(error);
    }
  });
}
