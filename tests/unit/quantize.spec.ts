import { describe, expect, it } from "vitest";
import { kMeansQuantizer } from "@/lib/quantize";
import type { CellColorBuffer, RGB } from "@/lib/types";

function makeCells(colors: RGB[]): CellColorBuffer {
  const data = new Uint8ClampedArray(colors.length * 3);
  colors.forEach(([r, g, b], i) => {
    data[i * 3] = r;
    data[i * 3 + 1] = g;
    data[i * 3 + 2] = b;
  });
  return { data, width: colors.length, height: 1 };
}

describe("kMeansQuantizer", () => {
  it("recovers two well-separated colors exactly", () => {
    const red: RGB = [220, 20, 20];
    const blue: RGB = [20, 20, 220];
    const cells = makeCells([red, red, red, blue, blue, blue]);

    const { cellPaletteIndex, palette } = kMeansQuantizer.quantize(cells, 2);

    expect(palette).toHaveLength(2);
    expect(new Set([cellPaletteIndex[0], cellPaletteIndex[1], cellPaletteIndex[2]]).size).toBe(1);
    expect(new Set([cellPaletteIndex[3], cellPaletteIndex[4], cellPaletteIndex[5]]).size).toBe(1);
    expect(cellPaletteIndex[0]).not.toBe(cellPaletteIndex[3]);
  });

  it("is deterministic for the same input", () => {
    const colors: RGB[] = Array.from({ length: 40 }, (_, i) => [(i * 37) % 256, (i * 91) % 256, (i * 53) % 256]) as RGB[];
    const cells = makeCells(colors);

    const first = kMeansQuantizer.quantize(cells, 5);
    const second = kMeansQuantizer.quantize(cells, 5);

    expect(Array.from(first.cellPaletteIndex)).toEqual(Array.from(second.cellPaletteIndex));
    expect(first.palette).toEqual(second.palette);
  });

  it("collapses to the number of distinct colors when k exceeds them, never producing empty entries", () => {
    const cells = makeCells([
      [10, 10, 10],
      [10, 10, 10],
      [200, 200, 200],
    ]);
    const { cellPaletteIndex, palette } = kMeansQuantizer.quantize(cells, 8);

    expect(palette.length).toBeLessThanOrEqual(2);
    for (const index of cellPaletteIndex) {
      expect(index).toBeLessThan(palette.length);
    }
  });

  it("never assigns an out-of-range palette index for a single input cell", () => {
    const { cellPaletteIndex, palette } = kMeansQuantizer.quantize(makeCells([[100, 100, 100]]), 5);
    expect(palette).toHaveLength(1);
    expect(cellPaletteIndex[0]).toBe(0);
  });
});
