import { Worker } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import { exportDeadlineFor, gridPagesFor, LIMITS, type ExportJobPayload, type JobSettings, type JobStatus, type WorkerJob, type WorkerMessage } from "./job-protocol";
import type { ExportProgress } from "@/lib/export/export-progress";
import type { PixelBuffer, StitchPattern } from "@/lib/types";

/**
 * A bounded pool of generation workers (G-034 M2, sized by D149).
 *
 * Three workers, one job each, inside the processor's 3-CPU cap; a queue of twelve, beyond which the caller is told to
 * retry rather than made to wait indefinitely. Every job carries a deadline: past it the worker is terminated and
 * replaced, which also releases its memory. Cancellation works the same way, matching the browser's blunt terminate —
 * `buildPattern` has no interruption points.
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
  /** What the worker is asked to do; exports and generations share the pool so the CPU cap holds (D149). */
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
  deadlineTimer?: NodeJS.Timeout;
  workerIndex?: number;
  finishedAt?: number;
}

/** A finished job stays fetchable this long, so a client that reconnects can still collect its result. */
const RESULT_TTL_MS = 5 * 60_000;

export class GenerationPool {
  private readonly workers: Array<{ worker: Worker; jobId: string | null }> = [];
  private readonly jobs = new Map<string, Job>();
  private readonly queue: string[] = [];

  constructor(
    private readonly workerPath: string,
    private readonly size: number = LIMITS.poolSize,
    /** Injectable so the deadline behaviour can be tested without waiting the production 45 seconds. */
    private readonly deadlineMs: number = LIMITS.jobDeadlineMs
  ) {
    for (let i = 0; i < this.size; i++) this.workers.push({ worker: this.spawn(i), jobId: null });
    setInterval(() => this.sweep(), 30_000).unref();
  }

  private spawn(index: number): Worker {
    // V8 sizes a worker heap from the host unless told otherwise, so a bundle that fits on a developer machine can
    // exhaust the heap inside the container cap. An explicit ceiling makes the limit the same everywhere.
    const heapMb = Number(process.env.PROCESSOR_WORKER_HEAP_MB ?? 0);
    const worker = new Worker(this.workerPath, heapMb > 0 ? { resourceLimits: { maxOldGenerationSizeMb: heapMb } } : undefined);
    // A worker we have already replaced still emits `exit` (terminating one exits with code 1). Without this guard
    // that late event would fail whichever job took over its slot, not the one that was killed.
    const isCurrent = () => this.workers[index]?.worker === worker;
    worker.on("message", (message: WorkerMessage) => {
      if (isCurrent()) this.onMessage(index, message);
    });
    worker.on("error", (err) => {
      if (isCurrent()) this.onWorkerGone(index, err.message);
    });
    worker.on("exit", (code) => {
      if (code !== 0 && isCurrent()) this.onWorkerGone(index, `worker exited with code ${code}`);
    });
    worker.unref();
    return worker;
  }

  /** Accepts a generation, or refuses it when the queue is full. */
  submit(settings: Omit<JobSettings, "photoHash">, imageData: PixelBuffer): string {
    return this.enqueue((jobId) => ({ kind: "generate", jobId, settings, imageData }), this.deadlineMs);
  }

  /**
   * Accepts an export onto the same workers (G-034 M4). Its deadline follows what it will render: a paginated
   * export's grows with the chart's A4 page count, counted here before the job starts (D168).
   */
  submitExport(payload: ExportJobPayload): string {
    const pages = gridPagesFor(payload.pattern.width, payload.pattern.height, payload.overlapCells);
    return this.enqueue((jobId) => ({ kind: "export", jobId, payload }), exportDeadlineFor(payload.kind, pages));
  }

  private enqueue(build: (jobId: string) => WorkerJob, deadlineMs: number): string {
    if (this.queue.length >= LIMITS.queueLength) {
      throw new QueueFullError(Math.ceil((LIMITS.jobDeadlineMs / 1000) / 2));
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
    this.killJobWorker(job, "cancelled", "Cancelled.");
    return true;
  }

  /** Frees every worker; used by tests and shutdown. */
  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.worker.terminate()));
  }

  private pump(): void {
    while (this.queue.length > 0) {
      const free = this.workers.findIndex((w) => w.jobId === null);
      if (free === -1) return;
      const id = this.queue.shift()!;
      const job = this.jobs.get(id);
      if (!job || job.state !== "queued") continue;
      this.workers[free].jobId = id;
      job.workerIndex = free;
      job.state = "running";
      job.progress = 0;
      job.deadlineTimer = setTimeout(() => this.killJobWorker(job, "error", "The job ran past its time limit."), job.deadlineMs);
      job.deadlineTimer.unref();
      this.workers[free].worker.postMessage(job.work);
      this.notify(job);
    }
  }

  private onMessage(index: number, message: WorkerMessage): void {
    const job = this.jobs.get(message.jobId);
    if (!job || this.workers[index].jobId !== message.jobId) return; // a message from a job we already gave up on
    if (message.type === "progress") {
      job.progress = message.fraction;
      this.notify(job);
      return;
    }
    if (message.type === "export-progress") {
      job.exportProgress = message.progress;
      job.progress = message.progress.total > 0 ? message.progress.completed / message.progress.total : 0;
      this.notify(job);
      return;
    }
    this.workers[index].jobId = null;
    if (message.type === "done") {
      job.pattern = message.pattern;
      this.finish(job, "done");
    } else if (message.type === "export-done") {
      job.exportResult = { bytes: message.bytes, filename: message.filename, contentType: message.contentType };
      this.finish(job, "done");
    } else {
      this.finish(job, "error", message.message);
    }
    this.pump();
  }

  private onWorkerGone(index: number, reason: string): void {
    const jobId = this.workers[index].jobId;
    this.workers[index] = { worker: this.spawn(index), jobId: null };
    if (jobId) {
      const job = this.jobs.get(jobId);
      if (job) this.finish(job, "error", reason);
    }
    this.pump();
  }

  /** Terminates the worker running `job` and replaces it, which also releases the job's memory. */
  private killJobWorker(job: Job, state: JobStatus["state"], message: string): void {
    const index = job.workerIndex;
    if (index === undefined) return;
    void this.workers[index].worker.terminate();
    this.workers[index] = { worker: this.spawn(index), jobId: null };
    this.finish(job, state, message);
    this.pump();
  }

  private finish(job: Job, state: JobStatus["state"], message?: string): void {
    if (job.deadlineTimer) clearTimeout(job.deadlineTimer);
    job.state = state;
    job.message = message;
    job.finishedAt = Date.now();
    job.workerIndex = undefined;
    // The inputs are the biggest thing a finished job holds — a generation's pixels, an export's whole chart and photo.
    // The photo store still owns its own copy, and the finished file is kept separately.
    job.work = { kind: "generate", jobId: job.id, settings: { longerSideStitches: 0, colorCount: 0 }, imageData: { data: new Uint8ClampedArray(0), width: 0, height: 0 } };
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
