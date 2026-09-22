import { parentPort } from "node:worker_threads";
import { readSymmetry } from "@/lib/editor/pattern-serialize";
import { runExportJob } from "@/lib/export/export-jobs";
import { buildPattern } from "@/lib/pipeline/pattern";
import { kMeansQuantizer, plainKMeansQuantizer } from "@/lib/pipeline/quantize";
import { installServerExportBackend } from "./export-backend";
import type { WorkerJob, WorkerMessage } from "./job-protocol";
import { exportWithRust, generateWithRust } from "./rust-jobs";

/**
 * One pool worker (G-034 M2, M4): where generation and exports actually run.
 *
 * Both run in the Rust sidecar first (G-048 M6, D190) and fall back to the TypeScript below whenever it is absent or
 * fails, so the two paths must keep producing the same files: `npm run compare:rust` and `npm run compare:rust-exports`
 * are what proves they do.
 *
 * Generations call `buildPattern` with the arguments the browser's worker used to pass — including the same quantizer
 * for "original" — so the golden hashes (D107) still hold. Exports call `runExportJob`, the same function the editor
 * once ran in its own worker, with the canvas, font and texture supplied by the server backend (D153). Cancellation is
 * blunt for both: the pool terminates the thread, and the sidecar dies with it (D193).
 */

if (!parentPort) throw new Error("pool-worker must run as a worker thread");
const port = parentPort;

let exportBackendReady = false;

/**
 * Installed on the first export, not at startup: without its font every measured width would be zero, but a generation
 * needs neither the font nor the texture, and making every worker demand them at spawn killed the whole pool wherever
 * the assets were not beside the bundle.
 */
function ensureExportBackend(): void {
  if (exportBackendReady) return;
  installServerExportBackend();
  exportBackendReady = true;
}

function post(message: WorkerMessage): void {
  // Not transferred: an export's bytes are copied once per finished job, which is far cheaper than the risk of handing
  // out a detached buffer, and Node's transfer list is a different union from the DOM one anyway.
  port.postMessage(message);
}

async function runExport(job: Extract<WorkerJob, { kind: "export" }>): Promise<void> {
  const { jobId, payload } = job;
  // The wire carries only the axes that are on (`SerializedSymmetry`); this is the same reader a saved file goes
  // through, so the editable JSON inside an export records exactly what the editor had set.
  const symmetry = readSymmetry(payload.symmetry, payload.pattern.width, payload.pattern.height);
  const rust = await exportWithRust(payload, symmetry, (progress) => post({ type: "export-progress", jobId, progress }));
  if (rust) {
    post({ type: "export-done", jobId, bytes: rust.bytes, filename: rust.filename, contentType: rust.contentType });
    return;
  }
  ensureExportBackend();
  const result = await runExportJob(
    {
      kind: payload.kind,
      pattern: payload.pattern,
      baseName: payload.baseName,
      aidaCount: payload.aidaCount,
      sizeUnit: payload.sizeUnit,
      authorName: payload.authorName,
      overlapCells: payload.overlapCells,
      symmetry,
    },
    (progress) => post({ type: "export-progress", jobId, progress })
  );
  const bytes = new Uint8Array(await result.blob.arrayBuffer());
  post({ type: "export-done", jobId, bytes, filename: result.filename, contentType: result.blob.type || "application/octet-stream" });
}

async function runGenerate(job: Extract<WorkerJob, { kind: "generate" }>): Promise<void> {
  const rust = await generateWithRust(job, (fraction) => post({ type: "progress", jobId: job.jobId, fraction }));
  if (rust) {
    post({ type: "done", jobId: job.jobId, pattern: rust });
    return;
  }
  const pattern = buildPattern(job.imageData, {
      longerSideStitches: job.settings.longerSideStitches,
      colorCount: job.settings.colorCount,
      quantizer: job.settings.generationMode === "original" ? plainKMeansQuantizer : kMeansQuantizer,
      paletteMode: job.settings.paletteMode,
      edgeMode: job.settings.edgeMode,
      enhancementMode: job.settings.enhancementMode,
      ditherMode: job.settings.ditherMode,
      ditherTexture: job.settings.ditherTexture,
      vivid: job.settings.vivid,
    onProgress: (fraction) => post({ type: "progress", jobId: job.jobId, fraction }),
  });
  post({ type: "done", jobId: job.jobId, pattern });
}

port.on("message", (job: WorkerJob) => {
  if (job.kind === "export") {
    runExport(job).catch((err: unknown) => post({ type: "error", jobId: job.jobId, message: err instanceof Error ? err.message : "Couldn't complete that export." }));
    return;
  }
  runGenerate(job).catch((err: unknown) => post({ type: "error", jobId: job.jobId, message: err instanceof Error ? err.message : "Unknown error" }));
});
