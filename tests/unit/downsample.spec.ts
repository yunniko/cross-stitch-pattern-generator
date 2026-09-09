import { describe, expect, it } from "vitest";
import { downsampleToGrid, gridDimensionsFor } from "@/lib/downsample";
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
    expect(cells).toEqual([
      [255, 0, 0],
      [0, 0, 255],
    ]);
  });

  it("blends colors within a single averaged cell", () => {
    // 2x1 image, one red pixel and one blue pixel collapsed into 1 cell.
    const buffer = makeBuffer(2, 1, (x) => (x === 0 ? [255, 0, 0] : [0, 0, 255]));
    const cells = downsampleToGrid(buffer, 1, 1);
    expect(cells[0]).toEqual([128, 0, 128]);
  });

  it("weights fully transparent pixels out of the average", () => {
    const buffer = makeBuffer(
      2,
      1,
      (x) => (x === 0 ? [255, 0, 0] : [0, 0, 255]),
      (x) => (x === 1 ? 0 : 255)
    );
    const cells = downsampleToGrid(buffer, 1, 1);
    expect(cells[0]).toEqual([255, 0, 0]);
  });
});
