import { describe, expect, it } from "vitest";
import { mergeSimilarColors } from "@/lib/pipeline/palette-optimizer";
import { EMPTY_CELL, type RGB } from "@/lib/types";

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

describe("mergeSimilarColors with a colour floor (G-060)", () => {
  /** Three colours a merge apart, so the floor decides how far the chain runs. */
  const ramp: RGB[] = [
    [100, 100, 100],
    [101, 100, 100],
    [102, 100, 100],
  ];

  it("keeps a colour that holds at least the floor, and merges one that does not", () => {
    // Colour 1 holds 4 cells, colour 2 holds 1.
    const cells = Uint8Array.from([0, 0, 0, 0, 0, 1, 1, 1, 1, 2]);

    const floored = mergeSimilarColors(cells, ramp, undefined, undefined, false, 4);

    // 1 survives (4 >= 4); 2 is absorbed, and by its nearest neighbour rather than by colour 0.
    expect(floored.palette).toEqual([ramp[0], ramp[1]]);
    expect(Array.from(floored.cellPaletteIndex)).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1]);
  });

  it("is the unfloored merge when the floor is zero, for the same input", () => {
    const cells = Uint8Array.from([0, 0, 0, 0, 0, 1, 1, 1, 1, 2]);

    const off = mergeSimilarColors(cells, ramp, undefined, undefined, false, 0);
    const untouched = mergeSimilarColors(cells, ramp);

    expect(off.palette).toEqual(untouched.palette);
    expect(Array.from(off.cellPaletteIndex)).toEqual(Array.from(untouched.cellPaletteIndex));
    expect(untouched.palette).toHaveLength(1);
  });

  it("still lets a small colour merge into a protected one: only the loser is checked", () => {
    const cells = Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 1]);

    const floored = mergeSimilarColors(cells, ramp.slice(0, 2), undefined, undefined, false, 5);

    // Colour 0 holds 9 and is protected, but it is the winner here; colour 1 holds one cell and is still absorbed.
    expect(floored.palette).toEqual([ramp[0]]);
    expect(Array.from(floored.cellPaletteIndex)).toEqual(new Array(10).fill(0));
  });

  it("counts stitches, not cells: an empty cell is not a stitch of any colour", () => {
    // Colour 1 has one stitch and three empty cells beside it. A floor of 2 must absorb it all the same.
    const cells = Uint8Array.from([0, 0, 0, 1, EMPTY_CELL, EMPTY_CELL, EMPTY_CELL]);

    const floored = mergeSimilarColors(cells, ramp.slice(0, 2), undefined, undefined, true, 2);

    expect(floored.palette).toEqual([ramp[0]]);
    expect(Array.from(floored.cellPaletteIndex)).toEqual([0, 0, 0, 0, EMPTY_CELL, EMPTY_CELL, EMPTY_CELL]);
  });

  it("does not stop at a protected pair: a closer merge blocked does not block a farther one", () => {
    // 0 and 1 are the closest pair and both hold 5 cells, so the floor blocks them. 2 and 3 are farther apart but
    // still within the threshold, and 3 holds one cell: it must still be merged, which a loop that stopped at the
    // first blocked pair would miss.
    const palette: RGB[] = [
      [100, 100, 100],
      [100, 100, 101],
      [200, 100, 100],
      [201, 101, 100],
    ];
    const cells = Uint8Array.from([0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 3]);

    const floored = mergeSimilarColors(cells, palette, undefined, undefined, false, 5);

    expect(floored.palette).toEqual([palette[0], palette[1], palette[2]]);
    expect(Array.from(floored.cellPaletteIndex).slice(-1)).toEqual([2]);
  });
});
