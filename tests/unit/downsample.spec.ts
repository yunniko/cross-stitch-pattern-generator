import { describe, expect, it } from "vitest";
import { downsampleToGrid, gridDimensionsFor } from "@/lib/downsample";
import { cellRgb } from "@/lib/types";
import type { PixelBuffer, RGB } from "@/lib/types";

function makeBuffer(width: number, height: number, colorAt: (x: number, y: number) => RGB, alphaAt?: (x: number, y: number) => number): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colorAt(x, y);
      const o = (y * width + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = alphaAt ? alphaAt(x, y) : 255;
    }
  }
  return { data, width, height };
}

describe("gridDimensionsFor", () => {
  it("puts the requested stitch count on the longer side and preserves aspect ratio", () => {
    expect(gridDimensionsFor(200, 100, 50)).toEqual({ width: 50, height: 25 });
    expect(gridDimensionsFor(100, 200, 50)).toEqual({ width: 25, height: 50 });
  });

  it("never produces a zero-length side for extreme aspect ratios", () => {
    expect(gridDimensionsFor(2000, 10, 50).height).toBeGreaterThanOrEqual(1);
  });

  it("treats a square image as width === height", () => {
    expect(gridDimensionsFor(300, 300, 60)).toEqual({ width: 60, height: 60 });
  });
});

describe("downsampleToGrid", () => {
  it("averages each cell's source pixels", () => {
    // 4x4 image, left half red, right half blue -> a 2x1 grid should read
    // pure red then pure blue.
    const buffer = makeBuffer(4, 4, (x) => (x < 2 ? [255, 0, 0] : [0, 0, 255]));
    const cells = downsampleToGrid(buffer, 2, 1);
    expect(cellRgb(cells, 0)).toEqual([255, 0, 0]);
    expect(cellRgb(cells, 1)).toEqual([0, 0, 255]);
  });

  it("blends colors within a single averaged cell in linear light, not gamma-encoded sRGB", () => {
    // A 50/50 black/white split should average to sRGB ~188, not the ~128
    // a naive gamma-encoded average would give (HANDOVER.md D7).
    const buffer = makeBuffer(2, 1, (x) => (x === 0 ? [0, 0, 0] : [255, 255, 255]));
    const cells = downsampleToGrid(buffer, 1, 1);
    const [r, g, b] = cellRgb(cells, 0);
    expect(r).toBeGreaterThanOrEqual(185);
    expect(r).toBeLessThanOrEqual(191);
    expect(g).toBe(r);
    expect(b).toBe(r);
  });

  it("weights fully transparent pixels out of the average", () => {
    const buffer = makeBuffer(
      2,
      1,
      (x) => (x === 0 ? [255, 0, 0] : [0, 0, 255]),
      (x) => (x === 1 ? 0 : 255)
    );
    const cells = downsampleToGrid(buffer, 1, 1);
    expect(cellRgb(cells, 0)).toEqual([255, 0, 0]);
  });

  it("falls back to a direct source sample, not black, for a cell no pixel binned into", () => {
    // 8px-wide source upscaled to a 12-wide grid: nearest-cell binning
    // (floor(x*12/8)) skips columns 2, 5, 8, 11 entirely — a real bug the
    // domain-expert review found (HANDOVER.md D7). None of those cells
    // should come out black; the source here is uniform green, so every
    // fallback-sampled cell should read pure green too.
    const buffer = makeBuffer(8, 1, () => [10, 200, 10]);
    const cells = downsampleToGrid(buffer, 12, 1);
    for (let i = 0; i < 12; i++) {
      expect(cellRgb(cells, i)).toEqual([10, 200, 10]);
    }
  });

  it("falls back to white, not black, for a cell whose only reachable source pixel is fully transparent", () => {
    const buffer = makeBuffer(8, 1, () => [10, 200, 10], () => 0);
    const cells = downsampleToGrid(buffer, 12, 1);
    expect(cellRgb(cells, 2)).toEqual([255, 255, 255]);
  });
});
