import { describe, expect, it } from "vitest";
import { liftSelection, mergeSelection, moveSelection } from "@/lib/editor/pattern-edit";
import { applyQuickMirror, applyQuickMirrorWithSelection } from "@/lib/editor/symmetry";
import { EMPTY_CELL, type PaletteColor, type RGB, type StitchPattern } from "@/lib/types";

/** G-037 criterion 5: a quick mirror merges a floating selection and mirrors in one edit. */

function makePattern(width: number, height: number): StitchPattern {
  const colors: RGB[] = [
    [10, 10, 10],
    [200, 30, 30],
    [30, 200, 30],
    [30, 30, 200],
    [250, 250, 0],
  ];
  const cellPalette = Uint8Array.from({ length: width * height }, (_, i) => (i * 7 + Math.floor(i / width) * 3) % 4);
  const palette: PaletteColor[] = colors.map((rgb, index) => ({
    index,
    rgb,
    symbol: String(index),
    name: `Color ${index}`,
    count: cellPalette.filter((v) => v === index).length,
  }));
  return { width, height, cellPalette, palette, isLandscape: width >= height };
}

describe("applyQuickMirrorWithSelection", () => {
  it("merges the floating selection, vacating its origin, then mirrors the result", () => {
    const pattern = makePattern(8, 5);
    const lifted = liftSelection(pattern, { x: 0, y: 0, width: 2, height: 2 });
    const moved = moveSelection(lifted, 1, 2);
    const result = applyQuickMirrorWithSelection(pattern, moved, "left-half");
    expect(result.cellPalette).toEqual(applyQuickMirror(mergeSelection(pattern, moved), "left-half").cellPalette);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 8; x++) expect(result.cellPalette[y * 8 + x]).toBe(result.cellPalette[y * 8 + (7 - x)]);
    // The lifted origin cell not covered by the moved piece is EMPTY on the source side and mirrored as EMPTY.
    expect(result.cellPalette[0]).toBe(EMPTY_CELL);
    expect(result.cellPalette[7]).toBe(EMPTY_CELL);
  });

  it("is a plain quick mirror without a selection, keeping the palette and recounting", () => {
    const pattern = makePattern(9, 9);
    for (const kind of ["left-half", "upper-half", "upper-left-corner", "upper-left-half-corner"] as const) {
      const result = applyQuickMirrorWithSelection(pattern, null, kind);
      expect(result.cellPalette).toEqual(applyQuickMirror(pattern, kind).cellPalette);
      expect(result.palette.map((c) => c.rgb)).toEqual(pattern.palette.map((c) => c.rgb));
      result.palette.forEach((c) => expect(c.count).toBe(result.cellPalette.filter((v) => v === c.index).length));
    }
  });

  it("keeps the source photo reference untouched", () => {
    const sourceImage = {
      dataUrl: "data:image/png;base64,AA==",
      naturalWidth: 24,
      naturalHeight: 15,
      cellSizePx: 3,
      offsetX: 0,
      offsetY: 0,
    };
    const pattern = { ...makePattern(8, 5), sourceImage };
    expect(applyQuickMirrorWithSelection(pattern, null, "upper-half").sourceImage).toBe(sourceImage);
  });
});
