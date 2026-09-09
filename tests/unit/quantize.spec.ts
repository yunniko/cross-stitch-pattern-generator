import { describe, expect, it } from "vitest";
import { kMeansLabQuantizer } from "@/lib/quantize";
import type { RGB } from "@/lib/types";

describe("kMeansLabQuantizer", () => {
  it("recovers two well-separated colors exactly", () => {
    const red: RGB = [220, 20, 20];
    const blue: RGB = [20, 20, 220];
    const cells: RGB[] = [red, red, red, blue, blue, blue];

    const { cellPaletteIndex, palette } = kMeansLabQuantizer.quantize(cells, 2);

    expect(palette).toHaveLength(2);
    // Every red cell shares one palette index, every blue cell shares the other.
    expect(new Set([cellPaletteIndex[0], cellPaletteIndex[1], cellPaletteIndex[2]]).size).toBe(1);
    expect(new Set([cellPaletteIndex[3], cellPaletteIndex[4], cellPaletteIndex[5]]).size).toBe(1);
    expect(cellPaletteIndex[0]).not.toBe(cellPaletteIndex[3]);
  });

  it("is deterministic for the same input", () => {
    const cells: RGB[] = Array.from({ length: 40 }, (_, i) => [
      (i * 37) % 256,
      (i * 91) % 256,
      (i * 53) % 256,
    ]) as RGB[];

    const first = kMeansLabQuantizer.quantize(cells, 5);
    const second = kMeansLabQuantizer.quantize(cells, 5);

    expect(Array.from(first.cellPaletteIndex)).toEqual(Array.from(second.cellPaletteIndex));
    expect(first.palette).toEqual(second.palette);
  });

  it("collapses to the number of distinct colors when k exceeds them, never producing empty entries", () => {
    const cells: RGB[] = [
      [10, 10, 10],
      [10, 10, 10],
      [200, 200, 200],
    ];
    const { cellPaletteIndex, palette } = kMeansLabQuantizer.quantize(cells, 8);

    expect(palette.length).toBeLessThanOrEqual(2);
    for (const index of cellPaletteIndex) {
      expect(index).toBeLessThan(palette.length);
    }
  });

  it("never assigns an out-of-range palette index for a single input cell", () => {
    const { cellPaletteIndex, palette } = kMeansLabQuantizer.quantize([[100, 100, 100]], 5);
    expect(palette).toHaveLength(1);
    expect(cellPaletteIndex[0]).toBe(0);
  });
});
