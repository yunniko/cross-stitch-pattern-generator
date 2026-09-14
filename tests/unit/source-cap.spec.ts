import { describe, expect, it } from "vitest";
import { downsampleToGrid, gridDimensionsFor } from "@/lib/pipeline/downsample";
import { capSourceForGrid, sourcePixelsPerStitch } from "@/lib/pipeline/source-cap";
import type { PixelBuffer } from "@/lib/types";
import { makePhotoLikeBuffer } from "./helpers/fixtures";

describe("capSourceForGrid (G-035 M3, D127)", () => {
  it.each([
    [1200, 900, 100],
    [1234, 917, 100],
    [1001, 1000, 100],
    [917, 1234, 100],
    [1600, 1200, 150],
    [1200, 1600, 150],
    [1459, 977, 120],
  ])("keeps the stitch grid for a %ix%i photo at %i stitches", (width, height, stitches) => {
    const photo = makePhotoLikeBuffer(width, height);
    const grid = gridDimensionsFor(width, height, stitches);
    let applied = 0;
    for (const factor of [2, 4, 8]) {
      const result = capSourceForGrid(photo, stitches, factor);
      if (!result.applied) continue;
      applied++;
      expect([result.buffer.width, result.buffer.height]).toEqual([grid.width * factor, grid.height * factor]);
      expect(gridDimensionsFor(result.buffer.width, result.buffer.height, stitches)).toEqual(grid);
    }
    expect(applied).toBeGreaterThan(0);
  });

  it("never upscales a photo that already has fewer pixels than the target", () => {
    const photo = makePhotoLikeBuffer(150, 100);
    const result = capSourceForGrid(photo, 100, 2);
    expect(result).toMatchObject({ applied: false, reason: "not-larger" });
    expect(result.buffer).toBe(photo);
  });

  it("doesn't resample a photo that is exactly the target size", () => {
    const result = capSourceForGrid(makePhotoLikeBuffer(200, 150), 100, 2);
    expect(result).toMatchObject({ applied: false, reason: "not-larger" });
  });

  it("shrinks when one side already matches the target and the other is larger", () => {
    const result = capSourceForGrid(makePhotoLikeBuffer(1000, 751), 100, 10);
    expect(result.applied).toBe(true);
    expect([result.buffer.width, result.buffer.height]).toEqual([1000, 750]);
  });

  it("leaves a transparent photo alone, where 8-bit alpha rounding could turn a faint stitch white", () => {
    // Codex's example: fully transparent except one black pixel at alpha 1. Downsampled directly it stays black.
    const data = new Uint8ClampedArray(8 * 8 * 4);
    data[3] = 1;
    const photo: PixelBuffer = { data, width: 8, height: 8 };
    expect(Array.from(downsampleToGrid(photo, 2, 2).data.subarray(0, 3))).toEqual([0, 0, 0]);
    const result = capSourceForGrid(photo, 2, 2);
    expect(result).toMatchObject({ applied: false, reason: "transparent" });
    expect(result.buffer).toBe(photo);
  });

  it("gives an opaque photo the same stitch colors as downsampling it directly, within 8-bit rounding", () => {
    const photo = makePhotoLikeBuffer(1200, 900);
    const result = capSourceForGrid(photo, 100, 2);
    expect(result.applied).toBe(true);
    const direct = downsampleToGrid(photo, 100, 75);
    const viaCap = downsampleToGrid(result.buffer, 100, 75);
    let maxDiff = 0;
    for (let i = 0; i < direct.data.length; i++) maxDiff = Math.max(maxDiff, Math.abs(direct.data[i] - viaCap.data[i]));
    expect(maxDiff).toBeLessThanOrEqual(1);
  });

  it.each([1, 0, 2.5, Number.NaN])("rejects %s pixels per stitch", (factor) => {
    expect(() => capSourceForGrid(makePhotoLikeBuffer(400, 300), 50, factor)).toThrow();
  });

  it("reports pixels per stitch along the tighter axis", () => {
    expect(sourcePixelsPerStitch(1200, 900, 100)).toBe(12);
    expect(sourcePixelsPerStitch(150, 100, 100)).toBeCloseTo(100 / 67, 6);
  });
});
