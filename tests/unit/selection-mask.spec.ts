import { describe, expect, it } from "vitest";
import {
  duplicateSelection,
  fillSelection,
  flipSelectionHorizontal,
  liftSelection,
  mergeSelection,
  moveSelection,
  rotateSelectionClockwise,
} from "@/lib/editor/pattern-edit";
import { EMPTY_CELL, type PaletteColor, type StitchPattern } from "@/lib/types";

/**
 * A selection that is not a rectangle (G-072 M1).
 *
 * `FloatingSelection.mask` says which cells of the bounding box are really in the piece; absent means all of them,
 * which is what every rectangle selection is. These cover what the mask has to survive — being stamped, vacated,
 * flipped, turned and filled — and the one case that needs two masks rather than one.
 */

function palette(n: number): PaletteColor[] {
  return Array.from({ length: n }, (_, i) => ({
    index: i,
    rgb: [i * 10, i * 10, i * 10] as [number, number, number],
    symbol: String.fromCharCode(65 + i),
    name: `c${i}`,
    count: 0,
  }));
}

/** A 6x4 chart whose every cell holds colour 1, so anything left behind by a merge is visible as a 0 or an EMPTY. */
function chart(): StitchPattern {
  return {
    width: 6,
    height: 4,
    cellPalette: new Uint8Array(24).fill(1),
    palette: palette(3),
    isLandscape: true,
  };
}

/** A plus sign inside a 3x3 box: the corners are out, so a rectangle and this shape differ in exactly four cells. */
const PLUS = new Uint8Array([0, 1, 0, 1, 1, 1, 0, 1, 0]);
const PLUS_RECT = { x: 1, y: 0, width: 3, height: 3 };

const rows = (cells: Uint8Array, width: number) =>
  Array.from({ length: cells.length / width }, (_, y) => Array.from(cells.subarray(y * width, y * width + width)));

describe("a selection that is not a rectangle", () => {
  it("lifts the shape and remembers it twice, as the piece and as the hole", () => {
    const piece = liftSelection(chart(), PLUS_RECT, PLUS);
    expect(piece.mask).toEqual(PLUS);
    expect(piece.originMask).toEqual(PLUS);
    expect(piece.originRect).toEqual(PLUS_RECT);
  });

  it("stamps only its own cells, leaving what is under the corners", () => {
    // The destination is colour 0 while the piece carries 1s outside its shape, so a stamp that ignored the
    // mask would be visible. On a uniform chart it would not be, and this case would pass while testing nothing.
    const pattern = chart();
    for (let y = 0; y < 4; y++) for (let x = 3; x < 6; x++) pattern.cellPalette[y * 6 + x] = 0;
    // Origin dropped so this shows stamping alone; vacating has its own case below.
    const lifted = fillSelection(liftSelection(pattern, PLUS_RECT, PLUS), 2);
    const pasted = { ...lifted, originRect: undefined, originMask: undefined };
    const merged = mergeSelection(pattern, moveSelection(pasted, 2, 1));
    // The piece landed at (3,1); its corners must still show the destination's own colour 0.
    expect(rows(merged.cellPalette, 6)).toEqual([
      [1, 1, 1, 0, 0, 0],
      [1, 1, 1, 0, 2, 0],
      [1, 1, 1, 2, 2, 2],
      [1, 1, 1, 0, 2, 0],
    ]);
  });

  it("leaves a hole its own shape, not a rectangular one", () => {
    const pattern = chart();
    const piece = liftSelection(pattern, PLUS_RECT, PLUS);
    const merged = mergeSelection(pattern, moveSelection(piece, 0, 1));
    // The plus at (1,0) is vacated and re-stamped one row lower, so what is left is the part of the old
    // shape the new one does not cover. A rectangular vacate would have emptied the corners too.
    expect(rows(merged.cellPalette, 6)).toEqual([
      [1, 1, EMPTY_CELL, 1, 1, 1],
      [1, EMPTY_CELL, 1, EMPTY_CELL, 1, 1],
      [1, 1, 1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
    ]);
  });

  it("merging a shaped piece straight back where it came from changes nothing", () => {
    const pattern = chart();
    const piece = liftSelection(pattern, PLUS_RECT, PLUS);
    expect(mergeSelection(pattern, piece).cellPalette).toEqual(pattern.cellPalette);
  });

  it("fills its shape and not its box", () => {
    const piece = liftSelection(chart(), PLUS_RECT, PLUS);
    const filled = fillSelection(piece, 2);
    expect(rows(filled.cells, 3)).toEqual([
      [1, 2, 1],
      [2, 2, 2],
      [1, 2, 1],
    ]);
  });

  it("flips the mask with the cells, so the piece does not show through its old outline", () => {
    const wedge = new Uint8Array([1, 0, 0, 1, 1, 0, 1, 1, 1]);
    const piece = liftSelection(chart(), PLUS_RECT, wedge);
    expect(rows(flipSelectionHorizontal(piece).mask!, 3)).toEqual([
      [0, 0, 1],
      [0, 1, 1],
      [1, 1, 1],
    ]);
  });

  it("turns the piece without turning the hole it left behind", () => {
    // The case the two masks exist for. `originRect` keeps the box the piece came from, so after a rotation the
    // piece's own mask describes the turned shape while the hole must still describe the original one.
    const wedge = new Uint8Array([1, 0, 0, 1, 1, 0, 1, 1, 1]);
    const piece = rotateSelectionClockwise(liftSelection(chart(), PLUS_RECT, wedge));
    expect(rows(piece.mask!, 3)).toEqual([
      [1, 1, 1],
      [1, 1, 0],
      [1, 0, 0],
    ]);
    expect(piece.originMask).toEqual(wedge);
    expect(piece.originRect).toEqual(PLUS_RECT);
  });

  it("a duplicate carries the shape but vacates nothing", () => {
    const copy = duplicateSelection(liftSelection(chart(), PLUS_RECT, PLUS));
    expect(copy.mask).toEqual(PLUS);
    expect(copy.originRect).toBeUndefined();
    expect(copy.originMask).toBeUndefined();
  });

  it("re-frames the shape when the drag ran off the chart", () => {
    // A 3x3 lasso starting one column left of the chart: only its right two columns survive, and the mask has to be
    // cropped the same way or it would describe the wrong cells.
    const shape = new Uint8Array([1, 0, 0, 1, 1, 0, 1, 1, 1]);
    const piece = liftSelection(chart(), { x: -1, y: 0, width: 3, height: 3 }, shape);
    expect(piece.x).toBe(0);
    expect(piece.width).toBe(2);
    expect(rows(piece.mask!, 2)).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
  });

  it("a selection with no mask is still a plain rectangle", () => {
    const pattern = chart();
    const piece = fillSelection(liftSelection(pattern, PLUS_RECT), 2);
    expect(piece.mask).toBeUndefined();
    expect(mergeSelection(pattern, piece).cellPalette).toEqual(
      new Uint8Array([1, 2, 2, 2, 1, 1, 1, 2, 2, 2, 1, 1, 1, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1])
    );
  });
});
