import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PixelBuffer, StitchPattern } from "@/lib/types";
import type { WorkerRequest, WorkerResponse } from "@/lib/pattern.worker";

/**
 * A minimal fake Worker: captures the posted request and lets the test
 * script the response (or never respond, to simulate termination) --
 * exercising the real request/response protocol pattern-client.ts speaks,
 * without a real browser Worker.
 */
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<WorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  lastRequest: WorkerRequest | null = null;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(request: WorkerRequest) {
    this.lastRequest = request;
  }

  terminate() {
    this.terminated = true;
  }

  respond(response: WorkerResponse) {
    this.onmessage?.({ data: response } as MessageEvent<WorkerResponse>);
  }
}

const FIXTURE_IMAGE: PixelBuffer = { data: new Uint8ClampedArray(4), width: 1, height: 1 };
const FIXTURE_PATTERN = { width: 1, height: 1 } as unknown as StitchPattern;

describe("pattern-client", () => {
  beforeEach(() => {
    vi.resetModules();
    FakeWorker.instances = [];
    vi.stubGlobal("Worker", FakeWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves with the pattern when the worker reports done", async () => {
    const { runPatternJob } = await import("@/lib/pattern-client");
    const promise = runPatternJob({ imageData: FIXTURE_IMAGE, longerSideStitches: 10, colorCount: 2 });
    const w = FakeWorker.instances[0];
    w.respond({ type: "done", jobId: w.lastRequest!.jobId, pattern: FIXTURE_PATTERN });
    await expect(promise).resolves.toBe(FIXTURE_PATTERN);
  });

  it("forwards edgeMode through to the worker request (G-024 M5)", async () => {
    const { runPatternJob } = await import("@/lib/pattern-client");
    runPatternJob({ imageData: FIXTURE_IMAGE, longerSideStitches: 10, colorCount: 2, edgeMode: "crisp" }).catch(() => {});
    const w = FakeWorker.instances[0];
    expect(w.lastRequest?.edgeMode).toBe("crisp");
  });

  it("rejects a superseded job's promise instead of leaving it pending forever", async () => {
    const { runPatternJob } = await import("@/lib/pattern-client");
    const firstPromise = runPatternJob({ imageData: FIXTURE_IMAGE, longerSideStitches: 10, colorCount: 2 });
    const firstRejection = expect(firstPromise).rejects.toThrow("cancelled");

    // Starting a second job supersedes the first.
    const secondPromise = runPatternJob({ imageData: FIXTURE_IMAGE, longerSideStitches: 20, colorCount: 4 });
    await firstRejection;

    const secondWorker = FakeWorker.instances[1];
    secondWorker.respond({ type: "done", jobId: secondWorker.lastRequest!.jobId, pattern: FIXTURE_PATTERN });
    await expect(secondPromise).resolves.toBe(FIXTURE_PATTERN);
  });

  it("explicit cancelPatternJob rejects the pending promise", async () => {
    const { runPatternJob, cancelPatternJob } = await import("@/lib/pattern-client");
    const promise = runPatternJob({ imageData: FIXTURE_IMAGE, longerSideStitches: 10, colorCount: 2 });
    cancelPatternJob();
    await expect(promise).rejects.toThrow("cancelled");
  });

  it("a stale worker message delivered after cancellation is ignored, not applied", async () => {
    const { runPatternJob, cancelPatternJob } = await import("@/lib/pattern-client");
    const promise = runPatternJob({ imageData: FIXTURE_IMAGE, longerSideStitches: 10, colorCount: 2 });
    const staleWorker = FakeWorker.instances[0];
    const rejection = expect(promise).rejects.toThrow("cancelled");
    cancelPatternJob();
    await rejection;

    // The terminated worker's message arrives late; must not resolve the already-rejected promise.
    staleWorker.respond({ type: "done", jobId: staleWorker.lastRequest!.jobId, pattern: FIXTURE_PATTERN });
    await expect(promise).rejects.toThrow("cancelled");
  });

  // G-031 M3 (review E6): a worker with no job in flight is reused, keeping
  // its module-level caches (color names, brand OKLab tables) warm.
  it("reuses the worker for a job started after the previous one finished", async () => {
    const { runPatternJob } = await import("@/lib/pattern-client");
    const first = runPatternJob({ imageData: FIXTURE_IMAGE, longerSideStitches: 10, colorCount: 2 });
    const w = FakeWorker.instances[0];
    w.respond({ type: "done", jobId: w.lastRequest!.jobId, pattern: FIXTURE_PATTERN });
    await first;

    const second = runPatternJob({ imageData: FIXTURE_IMAGE, longerSideStitches: 20, colorCount: 4 });
    expect(FakeWorker.instances).toHaveLength(1);
    expect(w.terminated).toBe(false);
    w.respond({ type: "done", jobId: w.lastRequest!.jobId, pattern: FIXTURE_PATTERN });
    await expect(second).resolves.toBe(FIXTURE_PATTERN);
  });

  it("reuses the worker after a job reported an error", async () => {
    const { runPatternJob } = await import("@/lib/pattern-client");
    const first = runPatternJob({ imageData: FIXTURE_IMAGE, longerSideStitches: 10, colorCount: 2 });
    const w = FakeWorker.instances[0];
    w.respond({ type: "error", jobId: w.lastRequest!.jobId, message: "boom" });
    await expect(first).rejects.toThrow("boom");

    runPatternJob({ imageData: FIXTURE_IMAGE, longerSideStitches: 10, colorCount: 2 }).catch(() => {});
    expect(FakeWorker.instances).toHaveLength(1);
    expect(w.terminated).toBe(false);
  });

  it("discards a worker that fired a native error event, so a retry gets a fresh one", async () => {
    const { runPatternJob } = await import("@/lib/pattern-client");
    const first = runPatternJob({ imageData: FIXTURE_IMAGE, longerSideStitches: 10, colorCount: 2 });
    const broken = FakeWorker.instances[0];
    broken.onerror?.({ message: "script failed to load" } as ErrorEvent);
    await expect(first).rejects.toThrow("script failed to load");
    expect(broken.terminated).toBe(true);

    const retry = runPatternJob({ imageData: FIXTURE_IMAGE, longerSideStitches: 10, colorCount: 2 });
    expect(FakeWorker.instances).toHaveLength(2);
    const fresh = FakeWorker.instances[1];
    fresh.respond({ type: "done", jobId: fresh.lastRequest!.jobId, pattern: FIXTURE_PATTERN });
    await expect(retry).resolves.toBe(FIXTURE_PATTERN);
  });

  it("rejects, and recovers on the next job, when posting to the worker throws", async () => {
    const { runPatternJob } = await import("@/lib/pattern-client");
    const originalPost = FakeWorker.prototype.postMessage;
    FakeWorker.prototype.postMessage = () => {
      throw new Error("DataCloneError");
    };
    await expect(runPatternJob({ imageData: FIXTURE_IMAGE, longerSideStitches: 10, colorCount: 2 })).rejects.toThrow("DataCloneError");
    FakeWorker.prototype.postMessage = originalPost;

    const next = runPatternJob({ imageData: FIXTURE_IMAGE, longerSideStitches: 10, colorCount: 2 });
    const w = FakeWorker.instances[FakeWorker.instances.length - 1];
    w.respond({ type: "done", jobId: w.lastRequest!.jobId, pattern: FIXTURE_PATTERN });
    await expect(next).resolves.toBe(FIXTURE_PATTERN);
  });

  it("cancelPatternJob with nothing in flight leaves the worker alive", async () => {
    const { runPatternJob, cancelPatternJob } = await import("@/lib/pattern-client");
    const job = runPatternJob({ imageData: FIXTURE_IMAGE, longerSideStitches: 10, colorCount: 2 });
    const w = FakeWorker.instances[0];
    w.respond({ type: "done", jobId: w.lastRequest!.jobId, pattern: FIXTURE_PATTERN });
    await job;
    cancelPatternJob();
    expect(w.terminated).toBe(false);
  });

  it("terminates the previous worker when a new job supersedes it", async () => {
    const { runPatternJob } = await import("@/lib/pattern-client");
    runPatternJob({ imageData: FIXTURE_IMAGE, longerSideStitches: 10, colorCount: 2 }).catch(() => {});
    const first = FakeWorker.instances[0];
    runPatternJob({ imageData: FIXTURE_IMAGE, longerSideStitches: 20, colorCount: 4 }).catch(() => {});
    expect(first.terminated).toBe(true);
  });
});
