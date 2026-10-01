import { describe, expect, it } from "vitest";
import { DUPLICATE_OFFSET, mergeSelection } from "@/lib/editor/pattern-edit";
import { letteringSelection, letteringStart } from "@/lib/editor/text-selection";
import { EMPTY_CELL, type StitchPattern } from "@/lib/types";

/** G-081 M4: lettering as a piece in hand, and where it starts. */

// A 4 × 3 piece of lettering: an L.
const L = { width: 4, height: 3, ink: Uint8Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1, 1]) };

describe("letteringSelection", () => {
  it("holds the thread's index in the stitches and nothing in the rest, with a mask of exactly the stitches", () => {
    const piece = letteringSelection(L, 2, 5, 7);
    expect(piece).toMatchObject({ x: 5, y: 7, width: 4, height: 3 });
    expect(Array.from(piece.cells)).toEqual([2, E, E, E, 2, E, E, E, 2, 2, 2, 2]);
    expect(Array.from(piece.mask!)).toEqual(Array.from(L.ink));
  });

  it("has no origin: nothing was lifted from the chart, so nothing is vacated", () => {
    const piece = letteringSelection(L, 0, 0, 0);
    expect(piece.originRect).toBeUndefined();
    expect(piece.originMask).toBeUndefined();
  });

  it("does not share its mask with the lettering, which the interface keeps", () => {
    const piece = letteringSelection(L, 0, 0, 0);
    piece.mask![0] = 0;
    expect(L.ink[0]).toBe(1);
  });

  it("stamps the letters and leaves what is behind them when it is put down", () => {
    const behind = Uint8Array.from({ length: 10 * 6 }, (_, i) => (i % 3 === 0 ? 1 : EMPTY_CELL));
    const chart = {
      width: 10,
      height: 6,
      cellPalette: behind,
      palette: [
        { index: 0, rgb: [0, 0, 0], symbol: "a", name: "a", count: 0 },
        { index: 1, rgb: [9, 9, 9], symbol: "b", name: "b", count: 0 },
        { index: 2, rgb: [200, 0, 0], symbol: "c", name: "c", count: 0 },
      ],
    } as unknown as StitchPattern;
    const merged = mergeSelection(chart, letteringSelection(L, 2, 3, 1));
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 4; x++) {
        const at = (y + 1) * 10 + (x + 3);
        // A letter stitch is the thread; every other stitch of the box is what it was.
        expect(merged.cellPalette[at], `(${x}, ${y})`).toBe(L.ink[y * 4 + x] ? 2 : chart.cellPalette[at]);
      }
    }
    // Outside the box nothing moved.
    expect(merged.cellPalette[0]).toBe(chart.cellPalette[0]);
    expect(merged.cellPalette[59]).toBe(chart.cellPalette[59]);
  });
});
const E = EMPTY_CELL;

describe("letteringStart", () => {
  const chart = { width: 60, height: 40 };

  it("starts three stitches in from the corner of the view when nothing is in hand", () => {
    expect(letteringStart(null, { x: 10, y: 4 }, L, chart)).toEqual({ x: 10 + DUPLICATE_OFFSET, y: 4 + DUPLICATE_OFFSET });
    expect(DUPLICATE_OFFSET).toBe(3);
  });

  it("starts three stitches down and right of the piece in hand, as Paste does", () => {
    expect(letteringStart({ x: 20, y: 12 }, { x: 0, y: 0 }, L, chart)).toEqual({ x: 23, y: 15 });
  });

  it("is kept inside the chart", () => {
    expect(letteringStart(null, { x: 58, y: 38 }, L, chart)).toEqual({ x: 56, y: 37 });
    expect(letteringStart(null, { x: 0, y: 0 }, { width: 60, height: 40 }, chart)).toEqual({ x: 0, y: 0 });
  });
});
