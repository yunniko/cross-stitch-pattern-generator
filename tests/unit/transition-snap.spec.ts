import { describe, expect, it } from "vitest";
import { snapTransitionStrips } from "@/lib/crisp/transition-snap";
import { EMPTY_CELL, type PixelBuffer, type RGB } from "@/lib/types";

/**
 * G-038 M2: transition-strip snapping (D140). Every scene here has the same labels, a | blend | blend | b across 12
 * columns, so only the source photo decides whether the strip is a blurred edge, a real line or a gradient.
 */

const CELL = 8;
const GRID_W = 12;
const GRID_H = 6;
const A: RGB = [40, 70, 160];
const B: RGB = [230, 200, 60];

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (v: number) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
};
const mix = (t: number): RGB => [0, 1, 2].map((k) => toSrgb(toLinear(A[k]) + (toLinear(B[k]) - toLinear(A[k])) * t)) as unknown as RGB;

/** A source whose colour at column x (in source px) is `profile(x)` of the way from A to B. */
function source(profile: (x: number) => number): PixelBuffer {
  const W = GRID_W * CELL;
  const H = GRID_H * CELL;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = mix(profile(x + 0.5));
      data.set([c[0], c[1], c[2], 255], (y * W + x) * 4);
    }
  return { data, width: W, height: H };
}

const edgeAt = 6 * CELL;
const blurredEdge = source((x) => 1 / (1 + Math.exp(-(x - edgeAt) / (0.35 * CELL))));
/** A real line two cells wide at the midpoint colour, with sharp sides. */
const realLine = source((x) => (x < 5 * CELL ? 0 : x < 7 * CELL ? 0.5 : 1));
/** A straight ramp across the whole width. */
const ramp = source((x) => x / (GRID_W * CELL));

// Palette: 0 = A, 1 = B, 2 = one third, 3 = two thirds of the way in linear light.
const PALETTE: RGB[] = [A, B, mix(1 / 3), mix(2 / 3)];
const ROW = [0, 0, 0, 0, 0, 2, 3, 1, 1, 1, 1, 1];
function labels(row = ROW): Uint8Array {
  const out = new Uint8Array(GRID_W * GRID_H);
  for (let y = 0; y < GRID_H; y++) out.set(row, y * GRID_W);
  return out;
}

describe("snapTransitionStrips", () => {
  it("snaps a blurred edge's strip to the side of the fitted edge each cell lies on", () => {
    const input = labels();
    const { cellPaletteIndex, snapped } = snapTransitionStrips(input, GRID_W, GRID_H, PALETTE, blurredEdge);
    for (let y = 0; y < GRID_H; y++) {
      expect(Array.from(cellPaletteIndex.subarray(y * GRID_W, (y + 1) * GRID_W))).toEqual([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]);
      expect(Array.from(snapped.subarray(y * GRID_W, (y + 1) * GRID_W))).toEqual([0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0]);
    }
    expect(Array.from(input)).toEqual(Array.from(labels())); // the input isn't mutated
  });

  it("keeps a real line whose colour lies between its neighbours", () => {
    const input = labels([0, 0, 0, 0, 0, 2, 2, 1, 1, 1, 1, 1]);
    const { cellPaletteIndex, changes } = snapTransitionStrips(input, GRID_W, GRID_H, [A, B, mix(0.5)], realLine);
    expect(changes).toBe(0);
    expect(Array.from(cellPaletteIndex)).toEqual(Array.from(input));
  });

  it("keeps a gradient's bands", () => {
    const { changes } = snapTransitionStrips(labels(), GRID_W, GRID_H, PALETTE, ramp);
    expect(changes).toBe(0);
  });

  it("never touches a cell outside the palette", () => {
    const input = labels([0, 0, 0, 0, 0, EMPTY_CELL, 3, 1, 1, 1, 1, 1]);
    const { cellPaletteIndex } = snapTransitionStrips(input, GRID_W, GRID_H, PALETTE, blurredEdge);
    for (let y = 0; y < GRID_H; y++) expect(cellPaletteIndex[y * GRID_W + 5]).toBe(EMPTY_CELL);
  });

  it("leaves a strip between two near-identical sides alone", () => {
    const near: RGB[] = [A, [44, 74, 164], [42, 72, 162], [43, 73, 163]];
    expect(snapTransitionStrips(labels(), GRID_W, GRID_H, near, blurredEdge).changes).toBe(0);
  });

  it("rejects labels that don't match the grid", () => {
    expect(() => snapTransitionStrips(new Uint8Array(3), GRID_W, GRID_H, PALETTE, blurredEdge)).toThrow(/grid size/);
  });
});
