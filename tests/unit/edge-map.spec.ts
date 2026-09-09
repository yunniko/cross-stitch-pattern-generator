import { describe, expect, it } from "vitest";
import { computeCellImportance, computeEdgeMagnitude, edgeBetweenCells } from "@/lib/edge-map";
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
