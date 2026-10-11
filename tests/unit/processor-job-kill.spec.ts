import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateWithRust, JobFailedError, runCsJob } from "@/processor/rust-jobs";
import { GenerationPool } from "@/processor/pool";
import { makePhotoLikeBuffer } from "./helpers/fixtures";

/**
 * A cancelled or overrunning job's `cs-job` process is gone, not orphaned (G-134 M1, D407). Before, the pool terminated
 * a worker thread and the process it had spawned ran on, past the 3-CPU cap D149 sized the container for.
 */

process.env.CS_JOB_BINARY = path.join(
  __dirname,
  "..",
  "..",
  "rust",
  "target",
  "release",
  process.platform === "win32" ? "cs-job.exe" : "cs-job"
);

/** Big enough that a generation takes far longer than the few milliseconds these cases allow it. */
const slow = makePhotoLikeBuffer(600, 400);

function slowInput(): Buffer {
  const options = JSON.stringify({ longerSideStitches: 300, colorCount: 64 });
  return Buffer.concat([Buffer.from(options + "\n", "utf8"), Buffer.from(slow.data.buffer, slow.data.byteOffset, slow.data.byteLength)]);
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("a job's process", () => {
  it("is dead once a run held to a deadline settles", async () => {
    const run = await runCsJob(["generate", String(slow.width), String(slow.height)], slowInput(), { timeoutMs: 30 });
    expect(run.stdout).toBeNull();
    expect(run.error).toMatch(/time limit/i);
    expect(run.pid).toBeGreaterThan(0);
    expect(alive(run.pid!)).toBe(false);
  }, 60_000);

  it("is dead once an aborted run settles", async () => {
    const controller = new AbortController();
    const pending = runCsJob(["generate", String(slow.width), String(slow.height)], slowInput(), { signal: controller.signal });
    setTimeout(() => controller.abort(), 30);
    const run = await pending;
    expect(run.error).toBe("Cancelled.");
    expect(alive(run.pid!)).toBe(false);
  }, 60_000);

  it("fails with the sidecar's own words, as an error a person may be shown", async () => {
    // Pixels that do not match the stated size: the sidecar refuses them with a note of its own.
    const imageData = { data: slow.data, width: 10, height: 10 };
    const bad = { kind: "generate" as const, jobId: "x", settings: { longerSideStitches: 60, colorCount: 8 }, imageData };
    const failure = await generateWithRust(bad, () => {}).catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(JobFailedError);
    expect((failure as Error).message).toMatch(/bytes of RGBA/);
    expect((failure as Error).message).not.toMatch(/rust generation failed|panicked|\.rs:/);
  }, 60_000);
});

describe("a pool slot", () => {
  it("stays taken after a cancel until the process has exited, then serves the next job", async () => {
    const pool = new GenerationPool(1);
    try {
      const doomed = pool.submit({ longerSideStitches: 300, colorCount: 64 }, slow);
      expect(pool.status(doomed)?.state).toBe("running");
      const next = pool.submit({ longerSideStitches: 60, colorCount: 8 }, slow);
      expect(pool.cancel(doomed)).toBe(true);
      // The client hears at once; the next job waits for the process, not merely for the bookkeeping.
      expect(pool.status(doomed)?.state).toBe("cancelled");
      expect(pool.status(next)?.state).toBe("queued");
      for (;;) {
        const state = pool.status(next)?.state;
        if (state !== "queued" && state !== "running") break;
        await pool.waitForChange(next);
      }
      expect(pool.status(next)?.state).toBe("done");
    } finally {
      await pool.close();
    }
  }, 120_000);
});
