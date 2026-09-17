import { parentPort } from "node:worker_threads";
import { buildPattern } from "@/lib/pipeline/pattern";
import { kMeansQuantizer, plainKMeansQuantizer } from "@/lib/pipeline/quantize";
import type { WorkerJob, WorkerMessage } from "./job-protocol";

/**
 * One pool worker (G-034 M2): the server-side twin of `lib/pipeline/pattern.worker.ts`.
 *
 * It calls `buildPattern` with the same arguments the browser worker does — including the same quantizer choice for
 * "original" — so the golden hashes (D107) hold on both sides. Cancellation is blunt: the pool terminates the thread,
 * exactly as the browser client terminates its worker, because `buildPattern`'s hot loops are not checkpointed.
 */

if (!parentPort) throw new Error("pool-worker must run as a worker thread");
const port = parentPort;

function post(message: WorkerMessage): void {
  port.postMessage(message);
}

port.on("message", (job: WorkerJob) => {
  try {
    const pattern = buildPattern(job.imageData, {
      longerSideStitches: job.settings.longerSideStitches,
      colorCount: job.settings.colorCount,
      quantizer: job.settings.generationMode === "original" ? plainKMeansQuantizer : kMeansQuantizer,
      paletteMode: job.settings.paletteMode,
      edgeMode: job.settings.edgeMode,
      enhancementMode: job.settings.enhancementMode,
      onProgress: (fraction) => post({ type: "progress", jobId: job.jobId, fraction }),
    });
    post({ type: "done", jobId: job.jobId, pattern });
  } catch (err) {
    post({ type: "error", jobId: job.jobId, message: err instanceof Error ? err.message : "Unknown error" });
  }
});
