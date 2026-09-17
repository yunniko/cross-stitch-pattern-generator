import { Worker } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import { LIMITS, type JobSettings, type JobStatus, type WorkerJob, type WorkerMessage } from "./job-protocol";
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

interface Job {
  id: string;
  settings: Omit<JobSettings, "photoHash">;
  imageData: PixelBuffer;
  state: JobStatus["state"];
  progress: number;
  message?: string;
  pattern?: StitchPattern;
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
    const worker = new Worker(this.workerPath);
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

  /** Accepts a job, or refuses it when the queue is full. */
  submit(settings: Omit<JobSettings, "photoHash">, imageData: PixelBuffer): string {
    if (this.queue.length >= LIMITS.queueLength) {
      throw new QueueFullError(Math.ceil((LIMITS.jobDeadlineMs / 1000) / 2));
    }
    const id = randomUUID();
    this.jobs.set(id, { id, settings, imageData, state: "queued", progress: 0, changed: [] });
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
      queuePosition: queuePosition && queuePosition > 0 ? queuePosition : undefined,
      message: job.message,
    };
  }

  result(jobId: string): StitchPattern | null {
    return this.jobs.get(jobId)?.pattern ?? null;
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
      job.deadlineTimer = setTimeout(() => this.killJobWorker(job, "error", "The job ran past its time limit."), this.deadlineMs);
      job.deadlineTimer.unref();
      const message: WorkerJob = { jobId: id, settings: job.settings, imageData: job.imageData };
      this.workers[free].worker.postMessage(message);
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
    this.workers[index].jobId = null;
    if (message.type === "done") {
      job.pattern = message.pattern;
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
    // The pixels are the biggest thing a finished job holds; the photo store still owns its own copy.
    job.imageData = { data: new Uint8ClampedArray(0), width: 0, height: 0 };
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
