import { describe, expect, it } from "vitest";
import { denoiseForQuantization } from "@/lib/denoise";
import type { CellColorBuffer, RGB } from "@/lib/types";

function makeGrid(width: number, height: number, colors: RGB[]): CellColorBuffer {
  const data = new Uint8ClampedArray(width * height * 3);
  colors.forEach(([r, g, b], i) => {
    data[i * 3] = r;
    data[i * 3 + 1] = g;
    data[i * 3 + 2] = b;
  });
  return { data, width, height };
}

function pixelAt(cells: CellColorBuffer, x: number, y: number): RGB {
  const i = (y * cells.width + x) * 3;
  return [cells.data[i], cells.data[i + 1], cells.data[i + 2]];
}

describe("denoiseForQuantization", () => {
  it("leaves a perfectly uniform region completely unchanged", () => {
    const width = 5;
    const height = 5;
    const colors: RGB[] = Array.from({ length: width * height }, () => [120, 80, 200]);
    const cells = makeGrid(width, height, colors);

    const result = denoiseForQuantization(cells);
    expect(Array.from(result.data)).toEqual(Array.from(cells.data));
  });

  it("replaces a genuine single-cell outlier with its neighborhood's shared color", () => {
    // A 3x3 block of identical background cells with the center cell a
    // wildly different color -- a stand-in for a single noisy pixel.
    const width = 3;
    const height = 3;
    const bg: RGB = [100, 100, 100];
    const colors: RGB[] = Array.from({ length: 9 }, () => bg);
    colors[4] = [255, 0, 0]; // center

    const cells = makeGrid(width, height, colors);
    const result = denoiseForQuantization(cells);

    expect(pixelAt(result, 1, 1)).toEqual(bg);
  });

  it("leaves the outlier alone when its own importance exceeds the protection threshold", () => {
    // Same fixture as above, but the center cell is flagged as real content
    // (importance above the 0.5 threshold) -- a true minority detail (an
    // eye, a highlight) must survive this pass untouched so quantization
    // still has a chance to see it (HANDOVER.md D18/D19/D20).
    const width = 3;
    const height = 3;
    const bg: RGB = [100, 100, 100];
    const outlier: RGB = [255, 0, 0];
    const colors: RGB[] = Array.from({ length: 9 }, () => bg);
    colors[4] = outlier;

    const cells = makeGrid(width, height, colors);
    const importance = new Float32Array(9);
    importance[4] = 0.9;

    const result = denoiseForQuantization(cells, importance);
    expect(pixelAt(result, 1, 1)).toEqual(outlier);
  });

  it("never fabricates a color absent from the local neighborhood", () => {
    // A busy, non-uniform grid of genuinely distinct colors -- every output
    // cell must be one of the actual input colors in its own 3x3 window,
    // never a blend/average of them (the medoid's core safety property,
    // same convention as quantize.ts's injectWorstFitClusters).
    const width = 6;
    const height = 6;
    const colors: RGB[] = Array.from({ length: 36 }, (_, i) => [(i * 37) % 256, (i * 91) % 256, (i * 53) % 256] as RGB);
    const cells = makeGrid(width, height, colors);

    const result = denoiseForQuantization(cells);
    const inputSet = new Set(colors.map((c) => c.join(",")));
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        expect(inputSet.has(pixelAt(result, x, y).join(","))).toBe(true);
      }
    }
  });

  it("does not blend across a genuine hard edge into an intermediate color", () => {
    // Left half solid color A, right half solid color B, no noise -- every
    // output cell must stay exactly A or B, never a value in between.
    const width = 6;
    const height = 4;
    const a: RGB = [220, 20, 20];
    const b: RGB = [20, 20, 220];
    const colors: RGB[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) colors.push(x < width / 2 ? a : b);
    }
    const cells = makeGrid(width, height, colors);

    const result = denoiseForQuantization(cells);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const px = pixelAt(result, x, y);
        expect(px).toEqual(x < width / 2 ? a : b);
      }
    }
  });

  it("an all-zero (or absent) importance array still runs and protects nothing", () => {
    const width = 3;
    const height = 3;
    const bg: RGB = [50, 60, 70];
    const colors: RGB[] = Array.from({ length: 9 }, () => bg);
    colors[4] = [10, 200, 30];
    const cells = makeGrid(width, height, colors);

    const withExplicitZero = denoiseForQuantization(cells, new Float32Array(9));
    const withoutImportance = denoiseForQuantization(cells);
    expect(Array.from(withExplicitZero.data)).toEqual(Array.from(withoutImportance.data));
    expect(pixelAt(withoutImportance, 1, 1)).toEqual(bg);
  });
});
