import { randomUUID } from "node:crypto";
import { readSymmetry } from "@/lib/editor/pattern-serialize";
import {
  exportDeadlineFor,
  gridPagesFor,
  LIMITS,
  type ExportJobPayload,
  type JobSettings,
  type JobStatus,
  type WorkerJob,
} from "./job-protocol";
import { exportWithRust, generateWithRust, JobFailedError, type JobLimits } from "./rust-jobs";
import type { ExportProgress } from "@/lib/export/export-progress";
import type { PixelBuffer, StitchPattern } from "@/lib/types";

/**
 * A bounded pool of generation and export jobs (G-034 M2, sized by D149).
 *
 * Three slots, one `cs-job` process each, inside the processor's 3-CPU cap; a queue of twelve, beyond which the caller
 * is told to retry rather than made to wait indefinitely. Every job carries a deadline. Past it, or on a cancel, the
 * job's process is killed, and its slot is free only once that process has exited, so the cap holds against the
 * processes actually running rather than the jobs the pool still counts (D407).
 */

export class QueueFullError extends Error {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super("The server is busy generating other patterns.");
    this.name = "QueueFullError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** A finished export, held for collection exactly as a finished pattern is. */
export interface ExportResult {
  bytes: Uint8Array;
  filename: string;
  contentType: string;
}

interface Job {
  id: string;
  /** What the job runs; exports and generations share the pool so the CPU cap holds (D149). */
  work: WorkerJob;
  state: JobStatus["state"];
  progress: number;
  /** Set for exports only: pages done out of pages total, which is what the editor shows. */
  exportProgress?: ExportProgress;
  message?: string;
  pattern?: StitchPattern;
  exportResult?: ExportResult;
  deadlineMs: number;
  /** Resolved whenever the job's state or progress changes, so the event stream can await the next update. */
  changed: Array<() => void>;
  /** Aborting kills the job's process; set while it runs. */
  abort?: AbortController;
  finishedAt?: number;
}

/** What a person is told when a job fails for a reason the sidecar did not put into words. */
const GENERIC_FAILURE: Record<WorkerJob["kind"], string> = {
  generate: "That pattern could not be generated.",
  export: "Couldn't complete that export.",
};

/** A finished job stays fetchable this long, so a client that reconnects can still collect its result. */
const RESULT_TTL_MS = 5 * 60_000;

export class GenerationPool {
  private readonly jobs = new Map<string, Job>();
  private readonly queue: string[] = [];
  /** Each running job's settling, which happens only once its process has exited. */
  private readonly running = new Set<Promise<void>>();

  constructor(
    private readonly size: number = LIMITS.poolSize,
    /** Injectable so the deadline behaviour can be tested without waiting the production 45 seconds. */
    private readonly deadlineMs: number = LIMITS.jobDeadlineMs
  ) {
    setInterval(() => this.sweep(), 30_000).unref();
  }

  /** Accepts a generation, or refuses it when the queue is full. */
  submit(settings: Omit<JobSettings, "photoHash">, imageData: PixelBuffer): string {
    return this.enqueue((jobId) => ({ kind: "generate", jobId, settings, imageData }), this.deadlineMs);
  }

  /**
   * Accepts an export into the same slots (G-034 M4). Its deadline follows what it will render: a paginated export's
   * grows with the chart's A4 page count, counted here before the job starts (D168).
   */
  submitExport(payload: ExportJobPayload): string {
    // The A4 pages follow the Owner's cell size; the Pattern Keeper PDF keeps its own layout (G-083).
    const a4Pages = payload.kind.startsWith("a4-") || payload.kind === "all";
    const pages = gridPagesFor(payload.pattern.width, payload.pattern.height, payload.overlapCells, a4Pages ? payload.cellMm : undefined);
    return this.enqueue((jobId) => ({ kind: "export", jobId, payload }), exportDeadlineFor(payload.kind, pages));
  }

  private enqueue(build: (jobId: string) => WorkerJob, deadlineMs: number): string {
    if (this.queue.length >= LIMITS.queueLength) {
      throw new QueueFullError(Math.ceil(LIMITS.jobDeadlineMs / 1000 / 2));
    }
    const id = randomUUID();
    this.jobs.set(id, { id, work: build(id), state: "queued", progress: 0, deadlineMs, changed: [] });
    this.queue.push(id);
    this.pump();
    return id;
  }

  status(jobId: string): JobStatus | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    const queuePosition = job.state === "queued" ? this.queue.indexOf(jobId) + 1 : undefined;
    return {
      jobId,
      state: job.state,
      progress: job.state === "running" ? job.progress : undefined,
      // Exports report pages; the editor needs those, not just the fraction derived from them.
      exportProgress: job.state === "running" ? job.exportProgress : undefined,
      queuePosition: queuePosition && queuePosition > 0 ? queuePosition : undefined,
      message: job.message,
    };
  }

  result(jobId: string): StitchPattern | null {
    return this.jobs.get(jobId)?.pattern ?? null;
  }

  /** The finished file of an export job, or null while it is unfinished or if it was a generation. */
  exportResult(jobId: string): ExportResult | null {
    return this.jobs.get(jobId)?.exportResult ?? null;
  }

  /** Resolves the next time this job's state or progress changes, or immediately once it has finished. */
  waitForChange(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job || job.state === "done" || job.state === "error" || job.state === "cancelled") return Promise.resolve();
    return new Promise((resolve) => job.changed.push(resolve));
  }

  cancel(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job || job.state === "done" || job.state === "error" || job.state === "cancelled") return false;
    if (job.state === "queued") {
      const at = this.queue.indexOf(jobId);
      if (at !== -1) this.queue.splice(at, 1);
      this.finish(job, "cancelled", "Cancelled before it started.");
      return true;
    }
    // The client hears at once; the slot stays taken until the process has gone.
    const abort = job.abort;
    this.finish(job, "cancelled", "Cancelled.");
    abort?.abort();
    return true;
  }

  /** Kills every running job and resolves once their processes have exited; used by tests and shutdown. */
  async close(): Promise<void> {
    this.queue.length = 0;
    for (const job of this.jobs.values()) job.abort?.abort();
    await Promise.all(this.running);
  }

  private pump(): void {
    while (this.queue.length > 0 && this.running.size < this.size) {
      const id = this.queue.shift()!;
      const job = this.jobs.get(id);
      if (!job || job.state !== "queued") continue;
      job.state = "running";
      job.progress = 0;
      job.abort = new AbortController();
      this.notify(job);
      const settled = this.run(job, { signal: job.abort.signal, timeoutMs: job.deadlineMs }).finally(() => {
        this.running.delete(settled);
        this.pump();
      });
      this.running.add(settled);
    }
  }

  /** Runs a job's process to its end and records the outcome, unless a cancel already has. Never rejects. */
  private async run(job: Job, limits: JobLimits): Promise<void> {
    const work = job.work;
    try {
      if (work.kind === "export") {
        const { payload } = work;
        // The wire carries only the axes that are on (`SerializedSymmetry`); this is the same reader a saved file goes
        // through, so the editable JSON inside an export records exactly what the editor had set.
        const symmetry = readSymmetry(payload.symmetry, payload.pattern.width, payload.pattern.height);
        const file = await exportWithRust(
          payload,
          symmetry,
          (progress) => {
            if (job.state !== "running") return;
            job.exportProgress = progress;
            job.progress = progress.total > 0 ? progress.completed / progress.total : 0;
            this.notify(job);
          },
          limits
        );
        if (job.state === "running") {
          job.exportResult = file;
          this.finish(job, "done");
        }
      } else {
        const pattern = await generateWithRust(
          work,
          (fraction) => {
            if (job.state !== "running") return;
            job.progress = fraction;
            this.notify(job);
          },
          limits
        );
        if (job.state === "running") {
          job.pattern = pattern;
          this.finish(job, "done");
        }
      }
    } catch (err) {
      if (job.state !== "running") return;
      // Only the sidecar's own words, or the pool's, reach a person; anything else is logged and stated generically.
      if (err instanceof JobFailedError) this.finish(job, "error", err.message);
      else {
        console.error(`job ${job.id.slice(0, 8)} failed: ${err instanceof Error ? err.message : String(err)}`);
        this.finish(job, "error", GENERIC_FAILURE[work.kind]);
      }
    }
  }

  private finish(job: Job, state: JobStatus["state"], message?: string): void {
    job.state = state;
    job.message = message;
    job.finishedAt = Date.now();
    job.abort = undefined;
    // The inputs are the biggest thing a finished job holds — a generation's pixels, an export's whole chart and photo.
    // The photo store still owns its own copy, and the finished file is kept separately.
    job.work = {
      kind: "generate",
      jobId: job.id,
      settings: { longerSideStitches: 0, colorCount: 0 },
      imageData: { data: new Uint8ClampedArray(0), width: 0, height: 0 },
    };
    this.notify(job);
  }

  private notify(job: Job): void {
    const waiters = job.changed.splice(0, job.changed.length);
    for (const resolve of waiters) resolve();
  }

  /** Drops finished jobs once nobody is plausibly still collecting them. */
  private sweep(): void {
    const cutoff = Date.now() - RESULT_TTL_MS;
    for (const [id, job] of this.jobs) {
      if (job.finishedAt !== undefined && job.finishedAt < cutoff) this.jobs.delete(id);
    }
  }
}
