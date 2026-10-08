import { describe, expect, it } from "vitest";
import { pieceCellsIn } from "@/app/chart-scene";
import {
  compositeSelectionPreview,
  cropToSelection,
  liftSelection,
  mergeSelection,
  moveSelection,
  rotateSelectionClockwise,
  stampsCell,
} from "@/lib/editor/floating-selection";
import { EMPTY_CELL, type FloatingSelection, type StitchPattern } from "@/lib/types";

/**
 * G-119 M1 (D359): transparency as colour. On, a piece's empty stitches cover what they land on; off (the default), what
 * lies beneath them stays. The place a piece was lifted from is emptied either way.
 */

const E = EMPTY_CELL;

/** A 4 x 1 chart: colours 0 1 2 3. */
function row(): StitchPattern {
  const palette = [0, 1, 2, 3].map((index) => ({
    index,
    rgb: [index, index, index] as const,
    symbol: String(index),
    name: `Color ${index}`,
    count: 1,
  }));
  return { width: 4, height: 1, cellPalette: Uint8Array.from([0, 1, 2, 3]), palette, isLandscape: true } as StitchPattern;
}

/** A two-stitch piece, colour 0 then an empty stitch, laid at x. */
function piece(x: number, emptyCovers?: boolean): FloatingSelection {
  return { x, y: 0, width: 2, height: 1, cells: Uint8Array.from([0, E]), emptyCovers };
}

describe("transparency as colour", () => {
  it("off, or unset, leaves what lies under the piece's empty stitches", () => {
    expect(Array.from(mergeSelection(row(), piece(2)).cellPalette)).toEqual([0, 1, 0, 3]);
    expect(Array.from(mergeSelection(row(), piece(2, false)).cellPalette)).toEqual([0, 1, 0, 3]);
  });

  it("on, the empty stitch covers what it lands on", () => {
    expect(Array.from(mergeSelection(row(), piece(2, true)).cellPalette)).toEqual([0, 1, 0, E]);
  });

  it("the preview shows what the merge will do, both ways", () => {
    for (const covers of [false, true]) {
      const p = piece(1, covers);
      expect(Array.from(compositeSelectionPreview(row(), p).cellPalette)).toEqual(Array.from(mergeSelection(row(), p).cellPalette));
    }
  });

  it("the incremental preview draws exactly the stitches the merge writes", () => {
    for (const covers of [false, true]) {
      const drawn: number[] = [];
      pieceCellsIn(row(), piece(1, covers))({ x0: 0, y0: 0, x1: 4, y1: 1 }, (x) => drawn.push(x));
      expect(drawn).toEqual(covers ? [1, 2] : [1]);
    }
  });

  it("a lifted piece still empties the place it came from, whatever the switch", () => {
    const chart = row();
    // Lift stitches 0 and 1 (colours 0 and 1), empty the second in the piece, and move it right by two.
    const lifted = liftSelection(chart, { x: 0, y: 0, width: 2, height: 1 });
    const holed: FloatingSelection = { ...moveSelection(lifted, 2, 0), cells: Uint8Array.from([0, E]) };
    expect(Array.from(mergeSelection(chart, { ...holed, emptyCovers: false }).cellPalette)).toEqual([E, E, 0, 3]);
    expect(Array.from(mergeSelection(chart, { ...holed, emptyCovers: true }).cellPalette)).toEqual([E, E, 0, E]);
  });

  it("a piece put back where it was, unmoved, leaves the chart as it was, both ways", () => {
    const chart = row();
    for (const emptyCovers of [false, true]) {
      const lifted = { ...liftSelection(chart, { x: 1, y: 0, width: 2, height: 1 }), emptyCovers };
      expect(Array.from(mergeSelection(chart, lifted).cellPalette)).toEqual([0, 1, 2, 3]);
    }
  });

  it("a cell outside the mask is never written, even with the switch on", () => {
    const masked: FloatingSelection = { ...piece(2, true), mask: Uint8Array.from([1, 0]) };
    expect(stampsCell(masked, 1)).toBe(false);
    expect(Array.from(mergeSelection(row(), masked).cellPalette)).toEqual([0, 1, 0, 3]);
  });

  it("travels through a turn and is honoured by Crop to selection", () => {
    expect(rotateSelectionClockwise(piece(0, true)).emptyCovers).toBe(true);
    const cropped = cropToSelection(row(), piece(2));
    expect(Array.from(cropped.cellPalette)).toEqual([0, 3]);
  });
});
