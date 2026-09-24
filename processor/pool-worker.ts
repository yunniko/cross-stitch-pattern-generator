import { parentPort } from "node:worker_threads";
import { readSymmetry } from "@/lib/editor/pattern-serialize";
import type { WorkerJob, WorkerMessage } from "./job-protocol";
import { exportWithRust, generateWithRust } from "./rust-jobs";

/**
 * One pool worker (G-034 M2, M4): where generation and exports actually run.
 *
 * Both run in the Rust sidecar, and only there (G-068 M2, D221). The TypeScript pipeline that used to sit behind
 * this as a fallback was the specification the port was written against, not a second engine worth shipping; keeping
 * it meant every pipeline feature had to be written twice to stay byte-identical. A sidecar that is missing or falls
 * over now fails the job with a message, rather than quietly handing it to slower code that might not agree.
 *
 * The recorded golden hashes (D107) are checked against the binary itself by `npm run test:goldens:rust`.
 * Cancellation is blunt: the pool terminates the thread, and the sidecar dies with it (D193).
 */

if (!parentPort) throw new Error("pool-worker must run as a worker thread");
const port = parentPort;

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
  post({ type: "export-done", jobId, bytes: rust.bytes, filename: rust.filename, contentType: rust.contentType });
}

async function runGenerate(job: Extract<WorkerJob, { kind: "generate" }>): Promise<void> {
  const rust = await generateWithRust(job, (fraction) => post({ type: "progress", jobId: job.jobId, fraction }));
  post({ type: "done", jobId: job.jobId, pattern: rust });
}

port.on("message", (job: WorkerJob) => {
  if (job.kind === "export") {
    runExport(job).catch((err: unknown) =>
      post({ type: "error", jobId: job.jobId, message: err instanceof Error ? err.message : "Couldn't complete that export." })
    );
    return;
  }
  runGenerate(job).catch((err: unknown) =>
    post({ type: "error", jobId: job.jobId, message: err instanceof Error ? err.message : "Unknown error" })
  );
});
