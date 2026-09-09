import { describe, expect, it } from "vitest";
import { oklabDistanceSquared, rgbToOklab } from "@/lib/color";
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

  it("reinvests redundant-gray palette slots into a real, rare, saturated minority color (HANDOVER.md D20)", () => {
    // 190 cells of continuously-shaded gray "fur" + 10 cells of a tight,
    // very-different yellow "eye" -- a plain population-weighted k-means
    // run at this k never allocates a slot to the eye (verified against the
    // pre-fix baseline via a git worktree comparison, see HANDOVER.md).
    const grays: RGB[] = Array.from({ length: 190 }, (_, i) => {
      const g = 90 + (i % 40);
      return [g, g, g] as RGB;
    });
    const yellow: RGB[] = Array.from({ length: 10 }, () => [210, 190, 40] as RGB);
    const cells = makeCells([...grays, ...yellow]);

    const { palette } = kMeansQuantizer.quantize(cells, 4);
    const yellowOklab = rgbToOklab([210, 190, 40]);
    const hasYellow = palette.some((rgb) => oklabDistanceSquared(rgbToOklab(rgb), yellowOklab) < 0.01);
    expect(hasYellow).toBe(true);
  });

  it("doesn't fabricate colors when every requested color is already genuinely distinct", () => {
    // No redundancy to merge here -- the reinvestment mechanism should be a
    // complete no-op, same as if it didn't exist.
    const bands: RGB[] = [
      [220, 30, 30],
      [30, 160, 60],
      [40, 90, 220],
      [220, 200, 40],
      [180, 60, 200],
    ];
    const cells = makeCells(bands.flatMap((c) => Array.from({ length: 20 }, () => c)));

    const { palette } = kMeansQuantizer.quantize(cells, 5);
    expect(palette).toHaveLength(5);
    for (const band of bands) {
      const bandOklab = rgbToOklab(band);
      const closest = Math.min(...palette.map((rgb) => oklabDistanceSquared(rgbToOklab(rgb), bandOklab)));
      expect(closest).toBeLessThan(0.001);
    }
  });
});
