import { describe, expect, it } from "vitest";
import {
  cropError,
  cropSize,
  deltaToInsets,
  dragInsets,
  frameRect,
  insetsToDelta,
  isNoCrop,
  NO_CROP,
  parseInset,
  withInset,
} from "../../lib/editor/crop-frame";
import { resizeCanvas } from "../../lib/editor/pattern-edit";
import { EMPTY_CELL, MAX_STITCHES, type StitchPattern } from "../../lib/types";

/** G-089: the Crop tool's frame. It is the same arithmetic as `resizeCanvas`, with the sign turned round (D278). */

function chart(width: number, height: number): StitchPattern {
  const cellPalette = new Uint8Array(width * height).fill(EMPTY_CELL);
  const cellKind = new Uint8Array(width * height);
  for (let i = 0; i < cellPalette.length; i += 3) cellPalette[i] = i % 2;
  cellKind[0] = 1;
  return {
    width,
    height,
    cellPalette,
    cellKind,
    palette: [
      { index: 0, rgb: [200, 0, 0], name: "Red", symbol: "A", count: 0 },
      { index: 1, rgb: [0, 0, 200], name: "Blue", symbol: "B", count: 0 },
    ],
    isLandscape: width >= height,
    sourceImage: { dataUrl: "data:,", offsetX: 2, offsetY: 3 } as unknown as StitchPattern["sourceImage"],
    backstitch: [
      { x1: 0, y1: 0, x2: 2, y2: 2, paletteIndex: 0 },
      { x1: 8, y1: 8, x2: 10, y2: 10, paletteIndex: 1 },
    ],
  };
}

describe("the frame as the four numbers", () => {
  it("starts at nothing and says so", () => {
    expect(isNoCrop(NO_CROP)).toBe(true);
    expect(isNoCrop(withInset(NO_CROP, "left", 1))).toBe(false);
    expect(cropSize(20, 10, NO_CROP)).toEqual({ width: 20, height: 10 });
  });

  it("a positive number cuts, a negative one adds, and the size follows", () => {
    expect(cropSize(20, 10, { top: 1, right: 2, bottom: 3, left: 4 })).toEqual({ width: 14, height: 6 });
    expect(cropSize(20, 10, { top: -1, right: -2, bottom: 0, left: 0 })).toEqual({ width: 22, height: 11 });
  });

  it("converts to and from resizeCanvas's amounts, which have the opposite sign", () => {
    const insets = { top: 1, right: -2, bottom: 3, left: 0 };
    expect(insetsToDelta(insets)).toEqual({ top: -1, right: 2, bottom: -3, left: -0 });
    expect(deltaToInsets(insetsToDelta(insets))).toEqual({ top: 1, right: -2, bottom: 3, left: 0 });
  });

  it("applying it is exactly resizeCanvas with those amounts, for cuts, growth and both", () => {
    const base = chart(12, 12);
    for (const insets of [
      { top: 2, right: 1, bottom: 0, left: 3 },
      { top: -2, right: -1, bottom: 0, left: -3 },
      { top: 1, right: -4, bottom: 2, left: -1 },
    ]) {
      const viaTool = resizeCanvas(base, insetsToDelta(insets));
      const size = cropSize(12, 12, insets);
      expect([viaTool.width, viaTool.height]).toEqual([size.width, size.height]);
      // Same stitches, kinds, lines and photo alignment as the delta spelled out by hand.
      const byHand = resizeCanvas(base, { top: -insets.top, right: -insets.right, bottom: -insets.bottom, left: -insets.left });
      expect(viaTool).toEqual(byHand);
    }
  });

  it("cuts the edge it says and moves the lines and the photo with it", () => {
    const cropped = resizeCanvas(chart(12, 12), insetsToDelta({ top: 1, right: 0, bottom: 0, left: 2 }));
    expect(cropped.width).toBe(10);
    // The line from (0,0) lay in the cut-away corner and goes whole; the other moved up and left.
    expect(cropped.backstitch).toEqual([{ x1: 6, y1: 7, x2: 8, y2: 9, paletteIndex: 1 }]);
    expect(cropped.sourceImage?.offsetX).toBe(0);
    expect(cropped.sourceImage?.offsetY).toBe(2);
  });
});

describe("a frame that cannot be applied", () => {
  it("says what resizeCanvas says, so there is one set of words", () => {
    expect(cropError(10, 10, { top: 0, right: 0, bottom: 0, left: 10 })).toBe("Can't crop away the entire pattern.");
    expect(cropError(10, 10, { top: 5, right: 0, bottom: 5, left: 0 })).toBe("Can't crop away the entire pattern.");
    expect(cropError(10, 10, { top: 0, right: -MAX_STITCHES, bottom: 0, left: 0 })).toMatch(/exceed the maximum supported size of 1500/);
    expect(cropError(10, 10, { top: 1, right: 1, bottom: 1, left: 1 })).toBeNull();
    for (const insets of [
      { top: 0, right: 0, bottom: 0, left: 10 },
      { top: 0, right: -MAX_STITCHES, bottom: 0, left: 0 },
    ]) {
      expect(() => resizeCanvas(chart(10, 10), insetsToDelta(insets))).toThrow(cropError(10, 10, insets)!);
    }
  });
});

describe("typed numbers", () => {
  it("are whole numbers with an optional minus sign, and nothing else", () => {
    expect(parseInset("3")).toBe(3);
    expect(parseInset(" -4 ")).toBe(-4);
    expect(parseInset("0")).toBe(0);
    for (const bad of ["", "-", "1.5", "1e3", "abc", "+2", "--1", "99999999999999999999"]) expect(parseInset(bad)).toBeNull();
  });
});

describe("dragging", () => {
  const w = 20;
  const h = 10;
  it("moves an edge in and out by whole stitches", () => {
    expect(dragInsets(NO_CROP, "left", 3, 0, w, h)).toEqual({ ...NO_CROP, left: 3 });
    expect(dragInsets(NO_CROP, "right", 3, 0, w, h)).toEqual({ ...NO_CROP, right: -3 });
    expect(dragInsets(NO_CROP, "top", 0, 2, w, h)).toEqual({ ...NO_CROP, top: 2 });
    expect(dragInsets(NO_CROP, "bottom", 0, 2, w, h)).toEqual({ ...NO_CROP, bottom: -2 });
    expect(dragInsets({ ...NO_CROP, left: 4 }, "left", -6, 0, w, h)).toEqual({ ...NO_CROP, left: -2 });
  });

  it("moves two edges for a corner, from where the drag began", () => {
    expect(dragInsets({ top: 1, right: 1, bottom: 1, left: 1 }, "bottom-right", -2, -3, w, h)).toEqual({
      top: 1,
      right: 3,
      bottom: 4,
      left: 1,
    });
    expect(dragInsets(NO_CROP, "top-left", 2, 1, w, h)).toEqual({ ...NO_CROP, top: 1, left: 2 });
  });

  it("never leaves less than one stitch, and never more than the limit", () => {
    expect(dragInsets(NO_CROP, "left", 500, 0, w, h)).toEqual({ ...NO_CROP, left: w - 1 });
    expect(dragInsets({ ...NO_CROP, left: 5 }, "right", 5000, 0, w, h)).toEqual({ ...NO_CROP, left: 5, right: -(MAX_STITCHES - (w - 5)) });
    const dragged = dragInsets(NO_CROP, "top-left", 1000, 1000, w, h);
    expect(cropError(w, h, dragged)).toBeNull();
    const grown = dragInsets(NO_CROP, "bottom-right", 5000, 5000, w, h);
    expect(cropError(w, h, grown)).toBeNull();
    expect(cropSize(w, h, grown)).toEqual({ width: MAX_STITCHES, height: MAX_STITCHES });
  });

  it("keeps the other edge of the same axis when one is clamped by it", () => {
    const start = { ...NO_CROP, right: 8 };
    expect(dragInsets(start, "left", 100, 0, w, h)).toEqual({ ...start, left: w - 1 - 8 });
  });
});

describe("where the frame lies", () => {
  it("is the chart's rectangle moved by the numbers, outside the chart when it grows", () => {
    expect(frameRect(20, 10, NO_CROP)).toEqual({ x0: 0, y0: 0, x1: 20, y1: 10 });
    expect(frameRect(20, 10, { top: 2, right: -3, bottom: 1, left: -4 })).toEqual({ x0: -4, y0: 2, x1: 23, y1: 9 });
  });
});
