import { describe, expect, it } from "vitest";
import { cropToSelection, cutSelection, duplicateSelection, selectionCropDelta } from "@/lib/editor/floating-selection";
import { EMPTY_CELL, type FloatingSelection, type StitchPattern } from "@/lib/types";

/**
 * Cut takes the piece off the chart (where it was lifted from is emptied, nothing is put down); a crop to a piece is one
 * resize of the whole chart; and a paste put where it was taken from is a copy lifted from nowhere at the same place.
 */

const E = EMPTY_CELL;

function chart(cells: number[], width: number, backstitch?: StitchPattern["backstitch"]): StitchPattern {
  return {
    width,
    height: cells.length / width,
    cellPalette: Uint8Array.from(cells),
    palette: [0, 1].map((index) => ({ index, rgb: [index, index, index] as const, symbol: String(index), name: `c${index}`, count: 0 })),
    isLandscape: true,
    ...(backstitch ? { backstitch } : {}),
  };
}

function piece(cells: number[], width: number, height: number, x: number, y: number, from = { x, y }): FloatingSelection {
  return { x, y, width, height, cells: Uint8Array.from(cells), originRect: { ...from, width, height } };
}

describe("cutSelection", () => {
  it("empties where the piece was lifted from and puts nothing down where it now sits", () => {
    // A 2 × 1 piece lifted from (0,0) and moved to (2,1): both places end empty.
    const cut = cutSelection(chart([1, 1, 0, 0, 0, 0, 0, 0], 4), piece([1, 1], 2, 1, 2, 1, { x: 0, y: 0 }));

    expect(Array.from(cut.cellPalette)).toEqual([E, E, 0, 0, 0, 0, 0, 0]);
    expect(cut.palette.map((color) => color.count)).toEqual([6, 0]);
  });

  it("takes the lines the piece took and lays none of its own", () => {
    const line = { x1: 0, y1: 0, x2: 1, y2: 0, paletteIndex: 1 };
    const lifted = { ...piece([1], 1, 1, 0, 0), originLines: [line], backstitch: [line] };

    expect(cutSelection(chart([1, 0], 2, [line]), lifted).backstitch).toBeUndefined();
  });

  it("leaves the chart as it was for a piece lifted from nowhere, such as a paste", () => {
    const pasted = duplicateSelection(piece([1], 1, 1, 0, 0));

    expect(Array.from(cutSelection(chart([1, 0], 2), pasted).cellPalette)).toEqual([1, 0]);
  });
});

describe("selectionCropDelta", () => {
  it("is the resize cropToSelection makes of one grid", () => {
    const pattern = chart([0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0], 4);
    const selection = piece([1, 1], 2, 1, 1, 1);

    expect(selectionCropDelta(pattern, selection)).toEqual({ left: -1, top: -1, right: -1, bottom: -1 });
    expect(cropToSelection(pattern, selection).width).toBe(2);
  });

  it("refuses a piece entirely off the chart", () => {
    expect(() => selectionCropDelta({ width: 4, height: 3 }, piece([1], 1, 1, 9, 9))).toThrow("Can't crop away the entire pattern.");
  });
});

describe("duplicateSelection at no offset", () => {
  it("is a copy in the same place that vacates nothing", () => {
    const copy = duplicateSelection(piece([1, 1], 2, 1, 3, 2), 0);

    expect({ x: copy.x, y: copy.y, originRect: copy.originRect }).toEqual({ x: 3, y: 2, originRect: undefined });
  });
});
