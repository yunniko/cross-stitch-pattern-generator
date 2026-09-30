import { describe, expect, it } from "vitest";
import { fillSelection, flipsTransparency, lockTransparency, sameCells } from "@/lib/editor/pattern-edit";
import { fillSymmetric } from "@/lib/editor/symmetry";
import { EMPTY_CELL, type FloatingSelection, type StitchPattern } from "@/lib/types";

/**
 * G-079: the transparency lock. A change that turns an empty stitch into a colour, or a colour into an empty stitch, is
 * refused; one colour changing to another is not. The rule lives in one function so every tool applies the same one.
 */

const E = EMPTY_CELL;

describe("flipsTransparency", () => {
  it("is true only when the stitch's emptiness changes", () => {
    expect(flipsTransparency(E, 3)).toBe(true);
    expect(flipsTransparency(3, E)).toBe(true);
    expect(flipsTransparency(3, 4)).toBe(false);
    expect(flipsTransparency(E, E)).toBe(false);
    expect(flipsTransparency(0, 0)).toBe(false);
  });
});

describe("lockTransparency", () => {
  it("puts back every change that would flip a stitch, and keeps colour-to-colour changes", () => {
    const base = Uint8Array.from([E, 1, 2, E, 0]);
    const next = Uint8Array.from([5, 5, E, E, 5]);
    lockTransparency(base, next);
    // [empty -> 5] refused, [1 -> 5] kept, [2 -> empty] refused, [empty -> empty] nothing, [0 -> 5] kept.
    expect(Array.from(next)).toEqual([E, 5, 2, E, 5]);
  });

  it("leaves a change that flips nothing untouched, and returns the buffer it was given", () => {
    const base = Uint8Array.from([1, 2, 3]);
    const next = Uint8Array.from([3, 2, 1]);
    expect(lockTransparency(base, next)).toBe(next);
    expect(Array.from(next)).toEqual([3, 2, 1]);
  });
});

describe("sameCells", () => {
  it("compares two buffers stitch by stitch", () => {
    expect(sameCells(Uint8Array.from([1, 2]), Uint8Array.from([1, 2]))).toBe(true);
    expect(sameCells(Uint8Array.from([1, 2]), Uint8Array.from([1, 3]))).toBe(false);
    expect(sameCells(Uint8Array.from([1, 2]), Uint8Array.from([1, 2, 3]))).toBe(false);
  });
});

describe("a flood fill under the lock", () => {
  // A 4 × 2 chart: a coloured block on the left, an empty background on the right.
  const pattern: StitchPattern = {
    width: 4,
    height: 2,
    cellPalette: Uint8Array.from([0, 0, E, E, 0, 0, E, E]),
    palette: [
      { index: 0, rgb: [200, 0, 0], symbol: "A", name: "A", count: 4 },
      { index: 1, rgb: [0, 0, 200], symbol: "B", name: "B", count: 0 },
    ],
  } as unknown as StitchPattern;
  const none = { vertical: false, horizontal: false, diagonal: false, antidiagonal: false };

  it("recolours the coloured block but cannot paint into the empty background, or erase the block", () => {
    const recolour = fillSymmetric(pattern, 0, none, 1, 8);
    expect(Array.from(lockTransparency(pattern.cellPalette, recolour.cellPalette))).toEqual([1, 1, E, E, 1, 1, E, E]);

    const intoBackground = fillSymmetric(pattern, 2, none, 1, 8);
    lockTransparency(pattern.cellPalette, intoBackground.cellPalette);
    expect(sameCells(intoBackground.cellPalette, pattern.cellPalette)).toBe(true);

    const erase = fillSymmetric(pattern, 0, none, E, 8);
    lockTransparency(pattern.cellPalette, erase.cellPalette);
    expect(sameCells(erase.cellPalette, pattern.cellPalette)).toBe(true);
  });
});

describe("fillSelection with the lock on", () => {
  const piece = (cells: number[], mask?: number[]): FloatingSelection =>
    ({
      x: 0,
      y: 0,
      width: 3,
      height: 2,
      cells: Uint8Array.from(cells),
      ...(mask ? { mask: Uint8Array.from(mask) } : {}),
      originRect: { x: 0, y: 0, width: 3, height: 2 },
    }) as FloatingSelection;

  it("paints only the stitches that are not empty", () => {
    const filled = fillSelection(piece([0, E, 2, E, 4, E]), 7, true);
    expect(Array.from(filled.cells)).toEqual([7, E, 7, E, 7, E]);
  });

  it("paints nothing at all when the piece is empty, and stays inside a shaped piece's mask", () => {
    expect(Array.from(fillSelection(piece([E, E, E, E, E, E]), 7, true).cells)).toEqual([E, E, E, E, E, E]);
    const shaped = fillSelection(piece([1, 2, 3, 4, 5, 6], [1, 0, 1, 0, 1, 0]), 7, true);
    expect(Array.from(shaped.cells)).toEqual([7, 2, 7, 4, 7, 6]);
  });

  it("still fills the whole area when the lock is off, as before", () => {
    const filled = fillSelection(piece([0, E, 2, E, 4, E]), 7);
    expect(Array.from(filled.cells)).toEqual([7, 7, 7, 7, 7, 7]);
  });
});
