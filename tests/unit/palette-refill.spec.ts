import { describe, expect, it } from "vitest";
import { rgbToOklab } from "@/lib/color/color";
import { DEFAULT_PALETTE_REFILL_OPTIONS, refillFreedSlots } from "@/lib/crisp/palette-refill";

const OPTIONS = DEFAULT_PALETTE_REFILL_OPTIONS;
import type { RGB } from "@/lib/types";

/** G-038 M5: refilling the palette slots Crisp+ frees (D142). */

const CELLS = 40;

/** One row of cells: the first half a dark-to-mid ramp, the second half a flat colour, all on one palette entry. */
function scene(): { labels: Uint8Array; palette: RGB[]; cellOklab: Float64Array; excluded: Uint8Array } {
  const colours: RGB[] = [];
  for (let i = 0; i < CELLS; i++) {
    colours.push(i < CELLS / 2 ? [40 + i * 6, 60 + i * 4, 150] : [230, 200, 60]);
  }
  const cellOklab = new Float64Array(CELLS * 3);
  colours.forEach((rgb, i) => {
    const lab = rgbToOklab(rgb);
    cellOklab[i * 3] = lab[0];
    cellOklab[i * 3 + 1] = lab[1];
    cellOklab[i * 3 + 2] = lab[2];
  });
  return { labels: new Uint8Array(CELLS), palette: [[120, 130, 110]], cellOklab, excluded: new Uint8Array(CELLS) };
}

describe("refillFreedSlots", () => {
  it("splits the colour whose cells vary most, until no colour is worth splitting", () => {
    const { labels, palette, cellOklab, excluded } = scene();
    const result = refillFreedSlots(labels, palette, cellOklab, excluded, 4);
    // The flat half never varies, and each half of the split ramp holds 10 cells, under `minCellsToSplit`.
    expect(result.added).toBe(2);
    expect(result.palette).toHaveLength(3);
    expect(new Set(result.cellPaletteIndex).size).toBe(3);
    expect(Array.from(labels)).toEqual(new Array(CELLS).fill(0)); // the input isn't mutated
  });

  it("fills more slots when the varied colour has cells to spare", () => {
    const { labels, palette, cellOklab, excluded } = scene();
    const result = refillFreedSlots(labels, palette, cellOklab, excluded, 4, { ...OPTIONS, minCellsToSplit: 4 });
    expect(result.added).toBeGreaterThanOrEqual(2);
    expect(new Set(result.cellPaletteIndex).size).toBe(1 + result.added);
  });

  it("adds nothing when the colour count is already met", () => {
    const { labels, palette, cellOklab, excluded } = scene();
    expect(refillFreedSlots(labels, palette, cellOklab, excluded, 1).added).toBe(0);
  });

  it("stops when no colour has enough varied cells left", () => {
    const { labels, palette, cellOklab, excluded } = scene();
    const result = refillFreedSlots(labels, palette, cellOklab, excluded, 40, OPTIONS);
    expect(result.added).toBeLessThan(39);
    expect(result.palette).toHaveLength(1 + result.added);
  });

  it("never trains a new colour on cells the Crisp+ passes moved", () => {
    const { labels, palette, cellOklab } = scene();
    // Mark the ramp's dark half as moved: the split must then come from the remaining cells only.
    const excluded = new Uint8Array(CELLS);
    for (let i = 0; i < CELLS / 2; i++) excluded[i] = 1;
    const result = refillFreedSlots(labels, palette, cellOklab, excluded, 2);
    expect(result.added).toBe(0); // the usable cells are one flat colour, so nothing is worth splitting
  });

  it("rejects a mask that doesn't match the labels", () => {
    const { labels, palette, cellOklab } = scene();
    expect(() => refillFreedSlots(labels, palette, cellOklab, new Uint8Array(3), 4)).toThrow(/excluded mask/);
  });
});
