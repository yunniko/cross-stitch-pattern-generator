import { describe, expect, it } from "vitest";
import { mergeSimilarColors } from "@/lib/palette-optimizer";
import type { RGB } from "@/lib/types";

describe("mergeSimilarColors", () => {
  it("merges two nearly-identical colors, keeping the more-used one's color", () => {
    const common: RGB = [200, 100, 50];
    const almostSame: RGB = [201, 101, 51];
    const palette: RGB[] = [common, almostSame];
    const cellPaletteIndex = Uint8Array.from([0, 0, 0, 1]); // color 0 used 3x, color 1 used once

    const result = mergeSimilarColors(cellPaletteIndex, palette);

    expect(result.palette).toHaveLength(1);
    expect(result.palette[0]).toEqual(common);
    expect(Array.from(result.cellPaletteIndex)).toEqual([0, 0, 0, 0]);
  });

  it("leaves two genuinely distinct colors alone", () => {
    const red: RGB = [220, 20, 20];
    const blue: RGB = [20, 20, 220];
    const palette: RGB[] = [red, blue];
    const cellPaletteIndex = Uint8Array.from([0, 1]);

    const result = mergeSimilarColors(cellPaletteIndex, palette);

    expect(result.palette).toHaveLength(2);
    expect(Array.from(result.cellPaletteIndex)).toEqual([0, 1]);
  });

  it("chains multi-step merges through a union-find remap correctly", () => {
    // Three colors, all within threshold of each other pairwise, should
    // collapse to one, and every cell should end up remapped to it.
    const a: RGB = [100, 100, 100];
    const b: RGB = [101, 100, 100];
    const c: RGB = [100, 101, 100];
    const palette: RGB[] = [a, b, c];
    const cellPaletteIndex = Uint8Array.from([0, 1, 2, 0, 1]);

    const result = mergeSimilarColors(cellPaletteIndex, palette);

    expect(result.palette).toHaveLength(1);
    expect(new Set(result.cellPaletteIndex)).toEqual(new Set([0]));
  });

  it("never leaves a cell pointing at a removed palette index", () => {
    const palette: RGB[] = [
      [10, 10, 10],
      [12, 10, 10],
      [220, 20, 220],
    ];
    const cellPaletteIndex = Uint8Array.from([0, 1, 2, 2, 2]);

    const result = mergeSimilarColors(cellPaletteIndex, palette);

    for (const index of result.cellPaletteIndex) {
      expect(index).toBeLessThan(result.palette.length);
    }
  });
});
