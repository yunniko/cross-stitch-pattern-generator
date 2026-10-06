import { describe, expect, it } from "vitest";
import { colorAt, describeColor } from "@/lib/editor/pick-color";
import { EMPTY_CELL, type BackstitchLine, type PaletteColor } from "@/lib/types";

/** G-104: what a picker press takes, at a point given in stitches from the chart's top left. */

// 3 x 2: row 0 is 0, 1, empty; row 1 is 2, 2, 1.
const cells = Uint8Array.from([0, 1, EMPTY_CELL, 2, 2, 1]);
const chart = (backstitch?: BackstitchLine[]) => ({ width: 3, height: 2, cellPalette: cells, backstitch });

describe("the colour a picker press takes", () => {
  it("is the stitch of the cell under the pointer, wherever in the cell it lands", () => {
    expect(colorAt(chart(), 0.5, 0.5)).toBe(0);
    expect(colorAt(chart(), 1.05, 0.95)).toBe(1);
    expect(colorAt(chart(), 0.99, 1.01)).toBe(2);
  });

  it("is the empty stitch on an empty cell, as any colour is", () => {
    expect(colorAt(chart(), 2.5, 0.5)).toBe(EMPTY_CELL);
  });

  it("is the last cell on the chart's far edge, not a cell past it", () => {
    expect(colorAt(chart(), 3, 2)).toBe(1);
    expect(colorAt(chart(), 0, 0)).toBe(0);
  });

  it("is a backstitch line's thread with the pointer on the line, and the stitch beside it", () => {
    const line: BackstitchLine = { x1: 0, y1: 1, x2: 3, y2: 1, paletteIndex: 4 };
    expect(colorAt(chart([line]), 1.5, 1.1), "on the line").toBe(4);
    expect(colorAt(chart([line]), 1.5, 1.6), "off it").toBe(2);
  });

  it("is the line drawn on top where two lines cross", () => {
    const under: BackstitchLine = { x1: 0, y1: 1, x2: 3, y2: 1, paletteIndex: 4 };
    const over: BackstitchLine = { x1: 1, y1: 0, x2: 1, y2: 2, paletteIndex: 5 };
    expect(colorAt(chart([under, over]), 1, 1)).toBe(5);
  });
});

describe("the colour the status bar names under the pointer", () => {
  const palette: PaletteColor[] = [{ index: 0, rgb: [10, 20, 30], symbol: "A", name: "310 - Black", count: 1 }];

  it("is the thread's name and colour", () => {
    expect(describeColor(palette, 0)).toEqual({ name: "310 - Black", rgb: [10, 20, 30] });
  });

  it("is the empty stitch, with no colour, on an empty cell", () => {
    expect(describeColor(palette, EMPTY_CELL)).toEqual({ name: "Empty (no stitch)", rgb: null });
  });

  it("names a value past the palette as unknown rather than as another thread", () => {
    expect(describeColor(palette, 7)).toEqual({ name: "Unknown colour 7", rgb: null });
  });
});
