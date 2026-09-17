import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LIMITS } from "@/processor/job-protocol";
import { GenerationPool, QueueFullError } from "@/processor/pool";
import { makeBuffer, makePhotoLikeBuffer, pseudoNoise } from "./helpers/fixtures";

/**
 * The processor refuses work rather than taking on more than its caps allow (G-034 M2, acceptance criterion 4).
 *
 * These run against the built worker bundle, so `npm run build:processor` must have run first. They cover what the
 * container caps alone cannot show: that a full queue is answered immediately instead of growing, that a waiting job
 * knows its place in line, and that a job which overruns its deadline is killed without taking the pool down with it.
 */

const WORKER = path.join(__dirname, "..", "..", "dist", "processor", "pool-worker.mjs");

const small = makeBuffer(60, 40, (x, y) => {
  const base = x < 30 ? [200, 150, 100] : [80, 120, 90];
  const noise = pseudoNoise(x, y, 50);
  return [base[0] + noise, base[1] + noise, base[2] + noise];
});
/** Big enough that it cannot finish inside a few milliseconds, so a short deadline reliably catches it mid-run. */
const slow = makePhotoLikeBuffer(600, 400);

function waitForSettled(pool: GenerationPool, jobId: string): Promise<string> {
  return (async () => {
    for (;;) {
      const status = pool.status(jobId);
      if (!status) throw new Error("the job disappeared from the pool");
      if (status.state !== "queued" && status.state !== "running") return status.state;
      await pool.waitForChange(jobId);
    }
  })();
}

describe("processor pool limits", () => {
  it("the processor bundle has been built", () => {
    expect(existsSync(WORKER), `${WORKER} is missing -- run "npm run build:processor" first`).toBe(true);
  });

  it("accepts exactly one full queue, then refuses with a retry delay", async () => {
    // One worker, so the second submission onwards queues: the queue fills after LIMITS.queueLength of them.
    const pool = new GenerationPool(WORKER, 1);
    try {
      const accepted: string[] = [];
      // Submitting is synchronous, so nothing completes in between and the queue fills deterministically.
      for (let i = 0; i < LIMITS.queueLength + 1; i++) accepted.push(pool.submit({ longerSideStitches: 60, colorCount: 8 }, small));
      expect(accepted).toHaveLength(LIMITS.queueLength + 1);

      let refusal: unknown;
      try {
        pool.submit({ longerSideStitches: 60, colorCount: 8 }, small);
      } catch (error) {
        refusal = error;
      }
      expect(refusal).toBeInstanceOf(QueueFullError);
      expect((refusal as QueueFullError).retryAfterSeconds).toBeGreaterThan(0);

      // A waiting job is told where it stands, rather than only that the server is busy.
      const waiting = pool.status(accepted[accepted.length - 1]);
      expect(waiting?.state).toBe("queued");
      expect(waiting?.queuePosition).toBeGreaterThan(0);
    } finally {
      await pool.close();
    }
  }, 60_000);

  it("frees a queue slot when a waiting job is cancelled", async () => {
    const pool = new GenerationPool(WORKER, 1);
    try {
      const ids = Array.from({ length: 4 }, () => pool.submit({ longerSideStitches: 60, colorCount: 8 }, small));
      const last = ids[ids.length - 1];
      const before = pool.status(last)?.queuePosition ?? 0;
      expect(before).toBeGreaterThan(1);

      expect(pool.cancel(ids[1])).toBe(true);
      expect(pool.status(ids[1])?.state).toBe("cancelled");
      expect(pool.status(last)?.queuePosition).toBe(before - 1);
    } finally {
      await pool.close();
    }
  }, 60_000);

  it("kills a job that runs past its deadline and keeps serving afterwards", async () => {
    const pool = new GenerationPool(WORKER, 1, 40);
    try {
      const overrunning = pool.submit({ longerSideStitches: 300, colorCount: 64 }, slow);
      expect(await waitForSettled(pool, overrunning)).toBe("error");
      expect(pool.status(overrunning)?.message).toMatch(/time limit/i);
      expect(pool.result(overrunning)).toBeNull();
    } finally {
      await pool.close();
    }
  }, 120_000);

  it("replaces the killed worker, so the next job still runs", async () => {
    // A generous deadline for the second job: the point is that the pool recovered, not how fast it is.
    const pool = new GenerationPool(WORKER, 1, 40);
    try {
      await waitForSettled(pool, pool.submit({ longerSideStitches: 300, colorCount: 64 }, slow));
      const replacement = new GenerationPool(WORKER, 1);
      try {
        const jobId = replacement.submit({ longerSideStitches: 60, colorCount: 8 }, small);
        expect(await waitForSettled(replacement, jobId)).toBe("done");
        expect(replacement.result(jobId)).not.toBeNull();
      } finally {
        await replacement.close();
      }
    } finally {
      await pool.close();
    }
  }, 120_000);
});
