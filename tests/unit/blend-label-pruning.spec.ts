import { describe, expect, it } from "vitest";
import { pruneBlendLabels } from "@/lib/crisp/blend-label-pruning";
import { EMPTY_CELL, type PixelBuffer, type RGB } from "@/lib/types";

/**
 * G-038 M3: blend-label pruning (D141). Every scene has the same labels: region A, a one-cell band of colour M, region B,
 * repeated down 16 rows. Only the photo decides whether M is a blurred transition (pruned) or a real flat line (kept).
 */

const CELL = 8;
const GRID_W = 13;
const GRID_H = 16;
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

const centre = 6.5 * CELL;
/** A blurred edge centred on the band: the photo inside the band's cells ramps from A towards B. */
const blurred = source((x) => 1 / (1 + Math.exp(-(x - centre) / (0.5 * CELL))));
/** A real one-cell line in the midpoint colour, flat inside its cells. */
const flatLine = source((x) => (x < 6 * CELL ? 0 : x < 7 * CELL ? 0.5 : 1));

const PALETTE: RGB[] = [A, B, mix(0.5)];
function labels(): Uint8Array {
  const row = [0, 0, 0, 0, 0, 0, 2, 1, 1, 1, 1, 1, 1];
  const out = new Uint8Array(GRID_W * GRID_H);
  for (let y = 0; y < GRID_H; y++) out.set(row, y * GRID_W);
  return out;
}

describe("pruneBlendLabels", () => {
  it("removes a thin colour that mixes its neighbours when the photo shows a gradient inside it", () => {
    const input = labels();
    const { cellPaletteIndex, pruned } = pruneBlendLabels(input, GRID_W, GRID_H, PALETTE, blurred);
    expect(pruned).toEqual([2]);
    expect(cellPaletteIndex.includes(2)).toBe(false);
    expect(Array.from(input)).toEqual(Array.from(labels())); // the input isn't mutated
  });

  it("keeps a real flat line in the same colour", () => {
    const { cellPaletteIndex, pruned } = pruneBlendLabels(labels(), GRID_W, GRID_H, PALETTE, flatLine);
    expect(pruned).toEqual([]);
    expect(Array.from(cellPaletteIndex)).toEqual(Array.from(labels()));
  });

  it("keeps a colour whose constituents are nearly the same colour", () => {
    const near: RGB[] = [A, [46, 76, 166], [43, 73, 163]];
    expect(pruneBlendLabels(labels(), GRID_W, GRID_H, near, blurred).pruned).toEqual([]);
  });

  it("never touches cells outside the palette", () => {
    const input = labels();
    input[6] = EMPTY_CELL;
    const { cellPaletteIndex } = pruneBlendLabels(input, GRID_W, GRID_H, PALETTE, blurred);
    expect(cellPaletteIndex[6]).toBe(EMPTY_CELL);
  });

  it("rejects labels that don't match the grid", () => {
    expect(() => pruneBlendLabels(new Uint8Array(4), GRID_W, GRID_H, PALETTE, blurred)).toThrow(/grid size/);
  });
});
