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

  it("area-weights a nonintegral-ratio downsample instead of whole-pixel binning (code-review 2026-09-09, finding 2)", () => {
    // The review's own repro: a symmetric 3-pixel black/white/black stripe
    // downsampled to 2 cells. Whole-pixel binning (the old bug) produced
    // gray-188 then black-0 -- asymmetric, even though the source is
    // perfectly symmetric. True area-weighted averaging gives cell 0 one
    // full black pixel + half the white pixel, and cell 1 the other half of
    // the white pixel + one full black pixel -- by symmetry, both cells
    // must come out identical, at the linear-light average of 2/3 black +
    // 1/3 white = sRGB 156 (verified by hand: linear avg 1/3 -> sRGB ~156).
    const buffer = makeBuffer(3, 1, (x) => (x === 1 ? [255, 255, 255] : [0, 0, 0]));
    const cells = downsampleToGrid(buffer, 2, 1);
    const cell0 = cellRgb(cells, 0);
    const cell1 = cellRgb(cells, 1);
    expect(cell0).toEqual(cell1);
    expect(cell0[0]).toBeGreaterThanOrEqual(154);
    expect(cell0[0]).toBeLessThanOrEqual(158);
  });

  it("preserves reflection symmetry at a nonintegral ratio (5 source pixels -> 3 cells)", () => {
    // A palindromic source (reflecting left-to-right leaves it unchanged)
    // must downsample to a palindromic result -- whole-pixel binning has no
    // reason to respect this, but area-weighted averaging must, since the
    // overlap geometry itself is symmetric.
    const colors: RGB[] = [
      [10, 20, 30],
      [200, 50, 90],
      [128, 128, 128],
      [200, 50, 90],
      [10, 20, 30],
    ];
    const buffer = makeBuffer(5, 1, (x) => colors[x]);
    const cells = downsampleToGrid(buffer, 3, 1);
    expect(cellRgb(cells, 0)).toEqual(cellRgb(cells, 2));
  });

  it("matches the old whole-pixel-binning result at an integral scale ratio (no regression for the common case)", () => {
    // At an exact integral ratio, every destination cell's rectangle aligns
    // exactly with a whole number of source pixels -- area-weighted and
    // whole-pixel-binned averaging must agree exactly here.
    const buffer = makeBuffer(4, 2, (x, y) => [x * 60, y * 60, 0]);
    const cells = downsampleToGrid(buffer, 2, 1);
    // Cell 0 covers source columns 0-1 (both rows averaged in linear light).
    expect(cellRgb(cells, 0)[0]).toBeGreaterThan(0);
    expect(cellRgb(cells, 1)[0]).toBeGreaterThan(cellRgb(cells, 0)[0]);
  });
});
