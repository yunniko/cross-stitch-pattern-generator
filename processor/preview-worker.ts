import { parentPort } from "node:worker_threads";
import { analyzeEnhancement, ENHANCEMENT_PRESETS } from "@/lib/pipeline/enhance";
import { buildEnhancedPreview } from "@/lib/pipeline/enhance-preview";
import type { PreviewJob, PreviewMessage } from "./job-protocol";

/**
 * The enhancement-preview worker (G-034 M3): where the preview is built, since M5 removed the browser's own.
 *
 * It is a separate worker from the generation pool for the reason D116 gave in the browser — a preview must never wait
 * behind a generation — and it calls the same two functions the browser worker does, so the preview shown is the one
 * `buildPattern` will act on. Analysis runs on the full photo and is applied to the downscaled copy, because
 * enhancement does not commute with downscaling (D116).
 *
 * Stateless: the encoded result is cached by the server, keyed by photo and mode, so there is nothing to keep here.
 */

if (!parentPort) throw new Error("preview-worker must run as a worker thread");
const port = parentPort;

port.on("message", (job: PreviewJob) => {
  try {
    const params = analyzeEnhancement(job.imageData, ENHANCEMENT_PRESETS[job.mode]);
    const preview = buildEnhancedPreview(job.imageData, params, job.maxSide);
    const message: PreviewMessage = { type: "done", requestId: job.requestId, preview };
    port.postMessage(message, [preview.data.buffer as ArrayBuffer]);
  } catch (err) {
    port.postMessage({
      type: "error",
      requestId: job.requestId,
      message: err instanceof Error ? err.message : "Unknown error",
    } satisfies PreviewMessage);
  }
});
