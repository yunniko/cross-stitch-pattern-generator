import { describe, expect, it } from "vitest";
import { computeCellImportance, computeEdgeMagnitude, edgeBetweenCells, sourceLuminance } from "@/lib/pipeline/edge-map";
import type { PixelBuffer, RGB } from "@/lib/types";

function makeBuffer(width: number, height: number, colorAt: (x: number, y: number) => RGB): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = colorAt(x, y);
      const o = (y * width + x) * 4;
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  return { data, width, height };
}

describe("computeEdgeMagnitude", () => {
  it("is zero everywhere on a perfectly flat image", () => {
    const buffer = makeBuffer(10, 10, () => [128, 128, 128]);
    const magnitude = computeEdgeMagnitude(buffer);
    expect(Array.from(magnitude).every((m) => m === 0)).toBe(true);
  });

  it("peaks near a hard vertical edge and is much lower far from it", () => {
    const buffer = makeBuffer(20, 20, (x) => (x < 10 ? [0, 0, 0] : [255, 255, 255]));
    const magnitude = computeEdgeMagnitude(buffer);
    const atEdge = magnitude[10 * 20 + 9]; // just left of the boundary
    const farFromEdge = magnitude[10 * 20 + 1]; // deep inside the black region
    expect(atEdge).toBeGreaterThan(farFromEdge);
    expect(atEdge).toBeGreaterThan(0.5);
    expect(farFromEdge).toBe(0);
  });

  it("suppresses low-amplitude per-pixel noise instead of treating it as an edge (HANDOVER.md D11 A4)", () => {
    // Deterministic +/-3-level dither pattern -- well below a real edge's
    // Sobel response, but nonzero everywhere in a way a naive normalize-
    // by-max would otherwise amplify into meaningful-looking "importance."
    const buffer = makeBuffer(20, 20, (x, y) => {
      const n = ((x * 7 + y * 13) % 5) - 2; // -2..2
      return [128 + n, 128 + n, 128 + n];
    });
    const magnitude = computeEdgeMagnitude(buffer);
    expect(Array.from(magnitude).every((m) => m === 0)).toBe(true);
  });

  it("a single strong outlier pixel doesn't crush a real edge toward zero (HANDOVER.md D11 A4)", () => {
    // A real hard edge across most of the image, plus one isolated
    // extremely bright "hot pixel" far from it. Normalizing by the single
    // max (the hot pixel's huge gradient) would push the real edge's own
    // normalized value down near zero; percentile normalization should not.
    const buffer = makeBuffer(30, 30, (x, y) => {
      if (x === 1 && y === 1) return [255, 0, 0]; // isolated outlier, far corner
      return x < 15 ? [0, 0, 0] : [255, 255, 255]; // real hard edge at x=15
    });
    const magnitude = computeEdgeMagnitude(buffer);
    const atRealEdge = magnitude[15 * 30 + 14];
    expect(atRealEdge).toBeGreaterThan(0.5);
  });
});

describe("computeCellImportance", () => {
  it("is near zero for a cell entirely inside a flat region", () => {
    const buffer = makeBuffer(30, 30, () => [100, 100, 100]);
    const edge = computeEdgeMagnitude(buffer);
    const importance = computeCellImportance(buffer, edge, 5, 5);
    expect(Array.from(importance).every((v) => v < 0.01)).toBe(true);
  });

  it("is high for a cell containing a real small high-contrast detail", () => {
    // A 3x3 dot in the middle of a 15x15 flat background, downsampled to a
    // 5x5 grid (~3x3 source pixels per cell) -- realistic enough that the
    // dot's own cell captures both the dot and its surrounding contrast,
    // unlike a 1:1 source:grid mapping where a single-pixel dot's own
    // gradient (computed from its neighbors) doesn't register on itself.
    const size = 15;
    const center = Math.floor(size / 2);
    const buffer = makeBuffer(size, size, (x, y) =>
      Math.abs(x - center) <= 1 && Math.abs(y - center) <= 1 ? [140, 140, 140] : [200, 200, 200]
    );
    const edge = computeEdgeMagnitude(buffer);
    const importance = computeCellImportance(buffer, edge, 5, 5);
    const centerCell = 2 * 5 + 2;
    const cornerCell = 0;
    expect(importance[centerCell]).toBeGreaterThan(0.3);
    expect(importance[cornerCell]).toBeLessThan(0.05);
  });
});

describe("edgeBetweenCells", () => {
  it("returns the stronger of the two cells' importance", () => {
    const importance = new Float32Array([0.2, 0.8, 0.5]);
    expect(edgeBetweenCells(importance, 0, 1)).toBeCloseTo(0.8);
    expect(edgeBetweenCells(importance, 1, 2)).toBeCloseTo(0.8);
    expect(edgeBetweenCells(importance, 0, 2)).toBeCloseTo(0.5);
  });
});

describe("every cell reads the pixels it covers, however fine the chart (G-051)", () => {
  /** A photo with a strong vertical edge down the middle and flat halves either side. */
  function edgePhoto(size: number) {
    return makeBuffer(size, size, (x) => (x < size / 2 ? [20, 20, 20] : [235, 235, 235]));
  }

  it("leaves no cell without a pixel when the chart is finer than the photo", () => {
    const source = edgePhoto(60);
    const gray = sourceLuminance(source);
    const edge = computeEdgeMagnitude(source, gray);
    for (const grid of [60, 90, 150, 240]) {
      const importance = computeCellImportance(source, edge, grid, grid, gray);
      // Every cell of a column that crosses the edge must see it; with the old mapping, whole columns saw nothing.
      const column = Math.floor((30 / 60) * grid);
      let seen = 0;
      for (let y = 0; y < grid; y++) if (importance[y * grid + column] > 0) seen++;
      expect(seen, `${grid}x${grid}: the edge column is found on every row`).toBe(grid);
    }
  });

  it("gives an upscaled chart the same importance as the pixels it samples", () => {
    const source = edgePhoto(40);
    const gray = sourceLuminance(source);
    const edge = computeEdgeMagnitude(source, gray);
    const oneToOne = computeCellImportance(source, edge, 40, 40, gray);
    const doubled = computeCellImportance(source, edge, 80, 80, gray);
    // Each 1:1 cell is one pixel; at 2x every cell covers the pixel its centre falls in, so the doubled grid repeats
    // the 1:1 values in 2x2 blocks.
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 40; x++) {
        expect(doubled[2 * y * 80 + 2 * x], `cell ${x},${y}`).toBeCloseTo(oneToOne[y * 40 + x], 6);
      }
    }
  });

  it("is unchanged for a chart no finer than the photo, which is what the golden hashes pin", () => {
    // The old mapping, pixel -> cell by truncation, kept for the comparison.
    const byTruncation = (source: ReturnType<typeof edgePhoto>, edge: Float32Array, grid: number, gray: Uint8Array) => {
      const { width: srcW, height: srcH } = source;
      const maxEdge = new Float32Array(grid * grid);
      const sum = new Float64Array(grid * grid);
      const sumSq = new Float64Array(grid * grid);
      const count = new Float64Array(grid * grid);
      for (let y = 0; y < srcH; y++) {
        const cellY = Math.min(grid - 1, Math.floor((y * grid) / srcH));
        for (let x = 0; x < srcW; x++) {
          const cellX = Math.min(grid - 1, Math.floor((x * grid) / srcW));
          const cell = cellY * grid + cellX;
          const i = y * srcW + x;
          if (edge[i] > maxEdge[cell]) maxEdge[cell] = edge[i];
          const l = gray[i] / 255;
          sum[cell] += l;
          sumSq[cell] += l * l;
          count[cell]++;
        }
      }
      return Float32Array.from({ length: grid * grid }, (_, i) => {
        const n = count[i] || 1;
        const mean = sum[i] / n;
        const variance = Math.max(0, sumSq[i] / n - mean * mean);
        return Math.min(1, 0.7 * maxEdge[i] + 0.3 * Math.min(1, Math.sqrt(variance) / 0.5));
      });
    };

    for (const [size, grid] of [
      [240, 60],
      [240, 37],
      [100, 100],
      [512, 150],
      [64, 16],
    ] as const) {
      const source = edgePhoto(size);
      const gray = sourceLuminance(source);
      const edge = computeEdgeMagnitude(source, gray);
      expect(Array.from(computeCellImportance(source, edge, grid, grid, gray)), `${size} -> ${grid}`).toEqual(
        Array.from(byTruncation(source, edge, grid, gray))
      );
    }
  });
});
