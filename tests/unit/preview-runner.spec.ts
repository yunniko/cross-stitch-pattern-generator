import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeEnhancement, ENHANCEMENT_PRESETS } from "@/lib/pipeline/enhance";
import { buildEnhancedPreview } from "@/lib/pipeline/enhance-preview";
import { PreviewBusyError, PreviewRunner } from "@/processor/preview-runner";
import { makePhotoLikeBuffer } from "./helpers/fixtures";

/**
 * The server's enhancement preview (G-034 M3, D152).
 *
 * The point of these is that the preview the server returns is the one the browser would have produced — the same
 * analysis on the full photo, applied to the same downscale — and that its dedicated worker refuses and recovers the
 * way the generation pool does. They run against the built bundle, so `npm run build:processor` must have run first.
 */

const WORKER = path.join(__dirname, "..", "..", "dist", "processor", "preview-worker.mjs");
const photo = makePhotoLikeBuffer(600, 400);

describe("preview runner", () => {
  it("the preview worker bundle has been built", () => {
    expect(existsSync(WORKER), `${WORKER} is missing -- run "npm run build:processor" first`).toBe(true);
  });

  it("returns exactly what the same pipeline call produces in process", async () => {
    const runner = new PreviewRunner(WORKER);
    try {
      const fromWorker = await runner.run(photo, "auto", 300);
      const expected = buildEnhancedPreview(photo, analyzeEnhancement(photo, ENHANCEMENT_PRESETS.auto), 300);
      expect(fromWorker.width).toBe(expected.width);
      expect(fromWorker.height).toBe(expected.height);
      // Byte-for-byte: a preview that differed from the browser's would mislead about what Generate will do.
      expect(Array.from(fromWorker.data)).toEqual(Array.from(expected.data));
    } finally {
      await runner.close();
    }
  }, 60_000);

  it("downscales to the requested longer side", async () => {
    const runner = new PreviewRunner(WORKER);
    try {
      const preview = await runner.run(photo, "brighten", 120);
      expect(Math.max(preview.width, preview.height)).toBe(120);
    } finally {
      await runner.close();
    }
  }, 60_000);

  it("refuses a request once its queue is full, with a retry delay", async () => {
    const runner = new PreviewRunner(WORKER, 2);
    try {
      // One is taken up immediately; the queue then holds two before the next is refused.
      const inFlight = [runner.run(photo, "auto", 300), runner.run(photo, "auto", 300), runner.run(photo, "auto", 300)];
      let refusal: unknown;
      try {
        runner.run(photo, "auto", 300);
      } catch (error) {
        refusal = error;
      }
      expect(refusal).toBeInstanceOf(PreviewBusyError);
      expect((refusal as PreviewBusyError).retryAfterSeconds).toBeGreaterThan(0);
      await Promise.allSettled(inFlight);
    } finally {
      await runner.close();
    }
  }, 60_000);

  it("abandons a preview past its deadline", async () => {
    const runner = new PreviewRunner(WORKER, 8, 5);
    try {
      await expect(runner.run(makePhotoLikeBuffer(1500, 1000), "auto", 1200)).rejects.toThrow(/time limit/i);
    } finally {
      await runner.close();
    }
  }, 120_000);

  it("keeps serving on the same runner after a deadline kill", async () => {
    // The deadline applies to every request on a runner, so the two sizes are chosen with wide margins either side of
    // it: a full-size analysis takes far longer than 300 ms, and a thumbnail far less.
    const runner = new PreviewRunner(WORKER, 8, 300);
    try {
      await expect(runner.run(makePhotoLikeBuffer(2000, 1500), "auto", 1200)).rejects.toThrow(/time limit/i);
      // Deliberately the same runner: the killed worker still emits `exit`, which must not be charged to this request.
      const preview = await runner.run(makePhotoLikeBuffer(200, 150), "brighten", 60);
      expect(Math.max(preview.width, preview.height)).toBe(60);
    } finally {
      await runner.close();
    }
  }, 120_000);
});
