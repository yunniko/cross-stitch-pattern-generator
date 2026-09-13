import type { PixelBuffer } from "../types";
import type { EnhancementModeId } from "./enhance";
import { ENHANCEMENT_PREVIEW_MAX_SIDE } from "./enhance-preview";
import type { EnhancePreviewRequest, EnhancePreviewResponse } from "./enhance-preview.worker";

/** Rejects a preview request that a newer request or an explicit cancel superseded. */
export class EnhancePreviewCancelledError extends Error {
  constructor() {
    super("Photo preview was cancelled");
    this.name = "EnhancePreviewCancelledError";
  }
}

let worker: Worker | null = null;
/** The buffer the current worker holds as its source, so it is sent once per photo, not once per mode switch. */
let workerSource: PixelBuffer | null = null;
let workerSourceId = 0;
let sourceCounter = 0;
let requestCounter = 0;
let active: { id: number; reject: (reason: unknown) => void } | null = null;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./enhance-preview.worker.ts", import.meta.url));
    workerSource = null;
  }
  return worker;
}

function discardWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  workerSource = null;
}

/** Cancels an in-flight preview by terminating its worker (the analysis isn't interruptible); idle workers are kept. */
export function cancelEnhancePreview(): void {
  if (!active) return;
  discardWorker();
  const reject = active.reject;
  active = null;
  reject(new EnhancePreviewCancelledError());
}

/**
 * Requests the enhanced preview of `imageData` in `mode`. One request at a time: a new one supersedes an in-flight one.
 * A worker that fired a native error is discarded so the next request gets a fresh one.
 */
export function requestEnhancePreview(imageData: PixelBuffer, mode: Exclude<EnhancementModeId, "off">, maxSide = ENHANCEMENT_PREVIEW_MAX_SIDE): Promise<PixelBuffer> {
  cancelEnhancePreview();
  const requestId = ++requestCounter;
  return new Promise((resolve, reject) => {
    active = { id: requestId, reject };
    const settle = () => {
      if (active?.id === requestId) active = null;
    };
    try {
      const w = getWorker();
      w.onmessage = (event: MessageEvent<EnhancePreviewResponse>) => {
        const msg = event.data;
        if (msg.requestId !== requestId || active?.id !== requestId) return; // stale reply from a superseded request
        settle();
        if (msg.type === "done") resolve(msg.preview);
        else reject(new Error(msg.message));
      };
      w.onerror = (event) => {
        if (active?.id !== requestId) return;
        settle();
        discardWorker();
        reject(new Error(event.message || "Photo preview failed"));
      };
      if (workerSource !== imageData) {
        workerSourceId = ++sourceCounter;
        const sourceMessage: EnhancePreviewRequest = { type: "source", sourceId: workerSourceId, imageData };
        w.postMessage(sourceMessage);
        workerSource = imageData;
      }
      const previewMessage: EnhancePreviewRequest = { type: "preview", requestId, sourceId: workerSourceId, mode, maxSide };
      w.postMessage(previewMessage);
    } catch (error) {
      settle();
      discardWorker();
      reject(error);
    }
  });
}
