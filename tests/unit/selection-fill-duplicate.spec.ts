import { describe, expect, it } from "vitest";
import { DUPLICATE_OFFSET, duplicateSelection, fillSelection, mergeSelection } from "@/lib/editor/pattern-edit";
import { EMPTY_CELL, type FloatingSelection, type StitchPattern } from "@/lib/types";

/**
 * G-063: Fill paints the selected area in one colour, Duplicate takes a copy of the piece in hand. Both are
 * functions of a piece, so they are tested as such; the hook only holds the state around them.
 */

function piece(cells: number[], width: number, height: number, x = 2, y = 3): FloatingSelection {
  return { x, y, width, height, cells: Uint8Array.from(cells), originRect: { x, y, width, height } };
}

describe("fillSelection", () => {
  it("paints every cell in the colour, whatever was there before", () => {
    const filled = fillSelection(piece([0, 1, 2, EMPTY_CELL, 4, 5], 3, 2), 7);

    expect(Array.from(filled.cells)).toEqual([7, 7, 7, 7, 7, 7]);
  });

  it("fills the area, not just its stitches: an empty cell becomes one", () => {
    const filled = fillSelection(piece([EMPTY_CELL, EMPTY_CELL, EMPTY_CELL, EMPTY_CELL], 2, 2), 3);

    expect(Array.from(filled.cells).every((cell) => cell === 3)).toBe(true);
  });

  it("moves nothing: position, size and what it was lifted from are untouched", () => {
    const before = piece([1, 2, 3, 4], 2, 2, 5, 9);
    const filled = fillSelection(before, 0);

    expect({ ...filled, cells: null }).toEqual({ ...before, cells: null });
    expect(filled.cells).not.toBe(before.cells);
  });

  it("stamps that colour into the chart once applied", () => {
    const pattern: StitchPattern = {
      width: 4,
      height: 3,
      cellPalette: Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      palette: [0, 1, 2].map((index) => ({ index, rgb: [index, index, index] as const, symbol: String(index), name: `c${index}`, count: 0 })),
      isLandscape: true,
    };
    const applied = mergeSelection(pattern, fillSelection(piece([0, 0, 0, 0], 2, 2, 1, 1), 2));

    // The 2x2 at (1,1) is colour 2; everything else is still colour 0.
    expect(Array.from(applied.cellPalette)).toEqual([0, 0, 0, 0, 0, 2, 2, 0, 0, 2, 2, 0]);
  });
});

describe("duplicateSelection", () => {
  it("offsets the copy so it reads as a second piece", () => {
    const original = piece([1, 2, 3, 4], 2, 2, 5, 9);
    const copy = duplicateSelection(original);

    expect(copy.x).toBe(5 + DUPLICATE_OFFSET);
    expect(copy.y).toBe(9 + DUPLICATE_OFFSET);
    expect(Array.from(copy.cells)).toEqual([1, 2, 3, 4]);
  });

  it("lifts nothing, so applying it leaves no hole where the original was", () => {
    // `originRect` is what a merge clears; a copy was never lifted out of the chart, so it must not carry one.
    expect(duplicateSelection(piece([1, 2, 3, 4], 2, 2)).originRect).toBeUndefined();
  });

  it("does not disturb the piece it copies", () => {
    const original = piece([1, 2, 3, 4], 2, 2, 5, 9);
    duplicateSelection(original);

    expect(original).toEqual(piece([1, 2, 3, 4], 2, 2, 5, 9));
  });
});
