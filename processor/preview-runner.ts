import { Worker } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import { LIMITS, type PreviewJob, type PreviewMessage } from "./job-protocol";
import type { EnhancementModeId } from "@/lib/pipeline/enhance";
import type { PixelBuffer } from "@/lib/types";

/**
 * The enhancement preview's own worker (G-034 M3, D152).
 *
 * Deliberately not the generation pool: D116 gave the browser preview a separate worker so a preview never waits
 * behind a generation, and the same reasoning holds here — three 12-second generations must not push a preview past
 * its two-second target. One worker is enough because a preview is short work, and one at a time bounds what this
 * adds to the container's CPU.
 *
 * A request past the queue length is refused rather than queued, and a preview past its deadline is abandoned with its
 * worker replaced, exactly as a generation is.
 */

export class PreviewBusyError extends Error {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super("The preview service is busy right now.");
    this.name = "PreviewBusyError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

interface Pending {
  job: PreviewJob;
  resolve: (preview: PixelBuffer) => void;
  reject: (reason: unknown) => void;
}

export class PreviewRunner {
  private worker: Worker;
  private readonly queue: Pending[] = [];
  private current: Pending | null = null;
  private deadlineTimer?: NodeJS.Timeout;

  constructor(
    private readonly workerPath: string,
    private readonly queueLength: number = LIMITS.previewQueueLength,
    private readonly deadlineMs: number = LIMITS.previewDeadlineMs
  ) {
    this.worker = this.spawn();
  }

  private spawn(): Worker {
    const worker = new Worker(this.workerPath);
    // A worker we have already replaced still emits `exit` (terminating one exits with code 1). Without this guard
    // that late event would fail whichever preview started after it, not the one that was killed.
    const isCurrent = () => worker === this.worker;
    worker.on("message", (message: PreviewMessage) => {
      if (isCurrent()) this.onMessage(message);
    });
    worker.on("error", (err) => {
      if (isCurrent()) this.onWorkerGone(err.message);
    });
    worker.on("exit", (code) => {
      if (code !== 0 && isCurrent()) this.onWorkerGone(`preview worker exited with code ${code}`);
    });
    worker.unref();
    return worker;
  }

  /** Runs one preview, or refuses when too many are already waiting. */
  run(imageData: PixelBuffer, mode: Exclude<EnhancementModeId, "off">, maxSide: number): Promise<PixelBuffer> {
    if (this.queue.length >= this.queueLength) {
      throw new PreviewBusyError(Math.ceil(this.deadlineMs / 1000));
    }
    return new Promise<PixelBuffer>((resolve, reject) => {
      this.queue.push({ job: { requestId: randomUUID(), imageData, mode, maxSide }, resolve, reject });
      this.pump();
    });
  }

  async close(): Promise<void> {
    await this.worker.terminate();
  }

  private pump(): void {
    if (this.current || this.queue.length === 0) return;
    this.current = this.queue.shift()!;
    this.deadlineTimer = setTimeout(() => this.killWorker("That preview ran past its time limit."), this.deadlineMs);
    this.deadlineTimer.unref();
    this.worker.postMessage(this.current.job);
  }

  private settle(): Pending | null {
    if (this.deadlineTimer) clearTimeout(this.deadlineTimer);
    const finished = this.current;
    this.current = null;
    return finished;
  }

  private onMessage(message: PreviewMessage): void {
    if (!this.current || this.current.job.requestId !== message.requestId) return; // a reply we already gave up on
    const finished = this.settle()!;
    if (message.type === "done") finished.resolve(message.preview);
    else finished.reject(new Error(message.message));
    this.pump();
  }

  private onWorkerGone(reason: string): void {
    const finished = this.settle();
    this.worker = this.spawn();
    finished?.reject(new Error(reason));
    this.pump();
  }

  /** Terminates the worker mid-preview and replaces it, which also releases the photo it was holding. */
  private killWorker(reason: string): void {
    void this.worker.terminate();
    this.onWorkerGone(reason);
  }
}
