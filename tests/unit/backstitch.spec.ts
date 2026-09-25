import { describe, expect, it } from "vitest";
import {
  clipLines,
  dedupeLines,
  symmetryLineOrbit,
  lengthByColor,
  lineLengthCells,
  lineWithinRect,
  normalizeLine,
  sameLine,
  withColorRemovedFromLines,
} from "@/lib/editor/backstitch";
import { deserializePattern, serializePattern } from "@/lib/editor/pattern-serialize";
import { resizeCanvas, shiftPattern } from "@/lib/editor/pattern-edit";
import type { BackstitchLine, PaletteColor, StitchPattern } from "@/lib/types";

/** Backstitch as data (G-073 M1): corner coordinates, what survives a resize, and what a file round-trips. */

const line = (x1: number, y1: number, x2: number, y2: number, paletteIndex = 0): BackstitchLine => ({
  x1,
  y1,
  x2,
  y2,
  paletteIndex,
});

function palette(n: number): PaletteColor[] {
  return Array.from({ length: n }, (_, i) => ({
    index: i,
    rgb: [i * 40, i * 40, i * 40] as [number, number, number],
    symbol: String.fromCharCode(65 + i),
    name: `c${i}`,
    count: 0,
  }));
}

function chart(lines: BackstitchLine[]): StitchPattern {
  return {
    width: 6,
    height: 4,
    cellPalette: new Uint8Array(24),
    palette: palette(2),
    isLandscape: true,
    backstitch: lines,
  };
}

describe("backstitch geometry", () => {
  it("is the same stitch drawn either way round", () => {
    expect(sameLine(line(1, 1, 3, 2), line(3, 2, 1, 1))).toBe(true);
    expect(sameLine(line(1, 1, 3, 2), line(1, 1, 3, 3))).toBe(false);
    expect(normalizeLine(line(3, 2, 1, 1))).toEqual(line(1, 1, 3, 2));
  });

  it("measures a diagonal as a diagonal, not as one cell", () => {
    // The legend's metres depend on this: a corner-to-corner diagonal is √2 cells, not 1.
    expect(lineLengthCells(line(0, 0, 1, 1))).toBeCloseTo(Math.SQRT2);
    expect(lineLengthCells(line(0, 0, 3, 0))).toBe(3);
  });

  it("totals length per thread, leaving a thread with no lines at zero", () => {
    const totals = lengthByColor([line(0, 0, 2, 0, 1), line(0, 1, 1, 1, 1)], 3);
    expect(totals).toEqual([0, 3, 0]);
  });

  it("takes a line only when both ends are inside the area", () => {
    const rect = { x: 1, y: 1, width: 3, height: 3 };
    expect(lineWithinRect(line(1, 1, 4, 4), rect)).toBe(true);
    expect(lineWithinRect(line(1, 1, 5, 4), rect)).toBe(false);
    expect(lineWithinRect(line(0, 1, 2, 2), rect)).toBe(false);
  });

  it("drops a line the chart no longer holds, rather than cutting it short", () => {
    const lines = [line(0, 0, 2, 2), line(4, 3, 6, 4)];
    expect(clipLines(lines, 3, 3)).toEqual([line(0, 0, 2, 2)]);
  });

  it("keeps a line that ends exactly on the far corner", () => {
    // Corners run 0..width inclusive, so (6,4) is on a 6x4 chart and not past it.
    expect(clipLines([line(5, 3, 6, 4)], 6, 4)).toHaveLength(1);
  });

  it("does not stack a line drawn twice", () => {
    expect(dedupeLines([line(0, 0, 1, 1), line(1, 1, 0, 0), line(0, 0, 1, 2)])).toHaveLength(2);
  });

  it("merges a thread's lines into another, or deletes them", () => {
    const lines = [line(0, 0, 1, 1, 0), line(1, 1, 2, 2, 1), line(2, 2, 3, 3, 2)];
    // Colour 1 merged into colour 2, which is then index 1 because 1 was removed.
    expect(withColorRemovedFromLines(lines, 1, 2).map((l) => l.paletteIndex)).toEqual([0, 1, 1]);
    // Merged into nothing: those lines go, and later indices close up.
    expect(withColorRemovedFromLines(lines, 1, null).map((l) => l.paletteIndex)).toEqual([0, 1]);
  });
});

describe("backstitch travels with the chart", () => {
  it("moves with a shift and goes when pushed off the edge", () => {
    const moved = shiftPattern(chart([line(0, 0, 2, 0), line(5, 3, 6, 4)]), 1, 0);
    // The first line moved; the second ran past the right edge, and a straight line has no partial form.
    expect(moved.backstitch).toEqual([line(1, 0, 3, 0)]);
  });

  it("moves with a resize and is cropped away with the cells", () => {
    const grown = resizeCanvas(chart([line(0, 0, 2, 0)]), { left: 2, right: 0, top: 1, bottom: 0 });
    expect(grown.backstitch).toEqual([line(2, 1, 4, 1)]);

    const cropped = resizeCanvas(chart([line(0, 0, 2, 0)]), { left: -3, right: 0, top: 0, bottom: 0 });
    expect(cropped.backstitch).toBeUndefined();
  });

  it("leaves a chart without backstitch exactly as it was", () => {
    const plain: StitchPattern = { ...chart([]), backstitch: undefined };
    expect(shiftPattern(plain, 1, 1).backstitch).toBeUndefined();
    expect(resizeCanvas(plain, { left: 1, right: 0, top: 0, bottom: 0 }).backstitch).toBeUndefined();
  });
});

describe("backstitch in a saved file", () => {
  it("round-trips through the editable save", () => {
    const lines = [line(0, 0, 2, 2, 1), line(3, 1, 3, 4, 0)];
    const back = deserializePattern(serializePattern(chart(lines)));
    expect(back.backstitch).toEqual(lines);
  });

  it("is absent from a file that has none, so an older build reads the same bytes it always did", () => {
    const json = JSON.parse(serializePattern({ ...chart([]), backstitch: undefined }));
    expect("backstitch" in json).toBe(false);
  });

  it("refuses a line outside the grid, in a colour it does not have, or with no length", () => {
    const withLines = (lines: unknown) => {
      const doc = JSON.parse(serializePattern(chart([])));
      return JSON.stringify({ ...doc, backstitch: lines });
    };
    expect(() => deserializePattern(withLines([{ x1: 0, y1: 0, x2: 7, y2: 0, paletteIndex: 0 }]))).toThrow(/outside its own grid/);
    expect(() => deserializePattern(withLines([{ x1: 0, y1: 0, x2: 1, y2: 0, paletteIndex: 9 }]))).toThrow(/isn't in its own palette/);
    expect(() => deserializePattern(withLines([{ x1: 2, y1: 2, x2: 2, y2: 2, paletteIndex: 0 }]))).toThrow(/no length/);
    expect(() => deserializePattern(withLines("nope"))).toThrow(/isn't a list/);
  });

  it("accepts a line ending on the far corner, which is one past the last cell", () => {
    const doc = JSON.parse(serializePattern(chart([])));
    const json = JSON.stringify({ ...doc, backstitch: [{ x1: 5, y1: 3, x2: 6, y2: 4, paletteIndex: 0 }] });
    expect(deserializePattern(json).backstitch).toHaveLength(1);
  });
});

describe("backstitch under symmetry", () => {
  const axes = (on: Record<string, boolean>) =>
    ({ vertical: false, horizontal: false, diagonal: false, antidiagonal: false, ...on }) as never;

  it("mirrors a line about the chart's middle, not half a cell off it", () => {
    // Corners run 0..6 on a 6-wide chart, so the mirror of 0 is 6 and the mirror of 2 is 4. Using the cell
    // formula here would put them at 5 and 3 — a shift of half a cell, which looks almost right.
    const mirrored = symmetryLineOrbit(line(0, 0, 2, 0), 6, 4, axes({ vertical: true }));
    expect(mirrored).toContainEqual(line(6, 0, 4, 0));
    expect(mirrored).toHaveLength(2);
  });

  it("gives four lines for two axes, and one for none", () => {
    expect(symmetryLineOrbit(line(0, 0, 1, 1), 6, 4, axes({ vertical: true, horizontal: true }))).toHaveLength(4);
    expect(symmetryLineOrbit(line(0, 0, 1, 1), 6, 4, axes({}))).toHaveLength(1);
  });

  it("does not repeat a line lying on the axis it is mirrored about", () => {
    // A line straight down the middle of a 6-wide chart maps onto itself.
    expect(symmetryLineOrbit(line(3, 0, 3, 4), 6, 4, axes({ vertical: true }))).toHaveLength(1);
  });
});
