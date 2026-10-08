import { describe, expect, it } from "vitest";
import { PREVIEW_DRAWING } from "@/lib/charts/saved-chart-link";
import { liftSelection } from "@/lib/editor/floating-selection";
import { limitById } from "@/lib/limits/limits";
import {
  countRefusal,
  readStampUpload,
  serializeStamp,
  stampFacts,
  stampFromPiece,
  stampCount,
  stampName,
  stampPreviewHref,
  stampsShown,
  STAMP_COUNT_LIMIT,
  UNTITLED_STAMP,
} from "@/lib/stamps/stamp";
import { EMPTY_CELL, type StitchPattern } from "@/lib/types";

/**
 * G-119 M2 (D360): a stamp is the piece as a chart of its own, its palette only the threads it uses, with its shape; read
 * back with the reader the editor opens files with.
 */

const E = EMPTY_CELL;

/** A 4 x 2 chart of four threads, the first two DMC, with a half stitch at (1, 0) and a backstitch in thread 3. */
function chart(): StitchPattern {
  const palette = [
    { index: 0, rgb: [255, 0, 0] as const, symbol: "A", name: "Red", count: 0, source: { brand: "dmc" as const, code: "321" } },
    { index: 1, rgb: [0, 255, 0] as const, symbol: "B", name: "Green", count: 0, source: { brand: "dmc" as const, code: "700" } },
    { index: 2, rgb: [0, 0, 255] as const, symbol: "C", name: "Blue", count: 0 },
    { index: 3, rgb: [16, 32, 48] as const, symbol: "D", name: "Ink", count: 0 },
  ];
  return {
    width: 4,
    height: 2,
    cellPalette: Uint8Array.from([0, 1, 2, E, 1, 1, 2, 2]),
    cellKind: Uint8Array.from([0, 1, 0, 0, 0, 0, 0, 0]),
    palette,
    isLandscape: true,
    backstitch: [{ x1: 0, y1: 0, x2: 2, y2: 2, paletteIndex: 3 }],
  };
}

describe("a stamp made from a piece", () => {
  it("keeps only the threads the piece uses, renumbered in the chart's order, with stitch types and backstitch", () => {
    const piece = liftSelection(chart(), { x: 0, y: 0, width: 2, height: 2 });
    const stamp = stampFromPiece(chart(), piece, "  Little   rose ")!;
    expect(stamp.mask).toBeUndefined();
    expect(stamp.pattern.name).toBe("Little rose");
    expect(stamp.pattern.palette.map((color) => color.name)).toEqual(["Red", "Green", "Ink"]);
    expect(Array.from(stamp.pattern.cellPalette)).toEqual([0, 1, 1, 1]);
    expect(Array.from(stamp.pattern.cellKind!)).toEqual([0, 1, 0, 0]);
    expect(stamp.pattern.backstitch).toEqual([{ x1: 0, y1: 0, x2: 2, y2: 2, paletteIndex: 2 }]);
    // Ink is a custom colour, so the stamp is not all DMC.
    expect(stamp.pattern.threadBrand).toBeUndefined();
  });

  it("is of one brand when every thread it keeps is", () => {
    const plain = { ...chart(), backstitch: undefined };
    const stamp = stampFromPiece(plain, liftSelection(plain, { x: 0, y: 0, width: 2, height: 1 }), "Pair")!;
    expect(stamp.pattern.threadBrand).toBe("dmc");
    expect(stamp.pattern.palette.map((color) => color.source?.code)).toEqual(["321", "700"]);
  });

  it("keeps its shape, and leaves out what lies outside it", () => {
    const piece = { ...liftSelection(chart(), { x: 0, y: 0, width: 2, height: 2 }), mask: Uint8Array.from([1, 0, 0, 1]), backstitch: [] };
    const stamp = stampFromPiece(chart(), piece, "Corner")!;
    expect(Array.from(stamp.mask!)).toEqual([1, 0, 0, 1]);
    expect(Array.from(stamp.pattern.cellPalette)).toEqual([0, E, E, 1]);
    expect(stamp.pattern.palette.map((color) => color.name)).toEqual(["Red", "Green"]);
  });

  it("is nothing for a piece with nothing in it", () => {
    const empty = { x: 0, y: 0, width: 2, height: 1, cells: Uint8Array.from([E, E]) };
    expect(stampFromPiece(chart(), empty, "x")).toBeNull();
  });
});

describe("a stamp sent to be kept", () => {
  it("reads back what was made, shape included, with what its card shows", () => {
    const piece = { ...liftSelection(chart(), { x: 0, y: 0, width: 2, height: 2 }), mask: Uint8Array.from([1, 1, 0, 1]) };
    const made = stampFromPiece(chart(), piece, "Rose")!;
    const read = readStampUpload(serializeStamp(made));
    if ("error" in read) throw new Error(read.error);
    expect(Array.from(read.stamp.pattern.cellPalette)).toEqual(Array.from(made.pattern.cellPalette));
    expect(Array.from(read.stamp.mask!)).toEqual([1, 1, 0, 1]);
    expect(read.stamp.pattern.backstitch).toEqual(made.pattern.backstitch);
    expect(read.summary).toEqual({
      name: "Rose",
      width: 2,
      height: 2,
      colors: 3,
      swatches: ["#ff0000", "#00ff00", "#102030"],
      backstitch: true,
    });
    // Written afresh, as it would be written again.
    expect(read.document).toBe(serializeStamp(read.stamp));
  });

  it("is refused when it is not a chart, carries a photo, has a shape that does not fit, or has nothing in it", () => {
    const made = JSON.parse(serializeStamp(stampFromPiece(chart(), liftSelection(chart(), { x: 0, y: 0, width: 2, height: 1 }), "a")!));
    const refusal = (value: unknown) => {
      const read = readStampUpload(typeof value === "string" ? value : JSON.stringify(value));
      return "error" in read ? read.error : null;
    };
    expect(refusal("{}")).toMatch(/not a stamp/);
    expect(refusal("nope")).toMatch(/not a stamp/);
    expect(
      refusal({ ...made, sourceImage: { dataUrl: "data:,", naturalWidth: 1, naturalHeight: 1, cellSizePx: 1, offsetX: 0, offsetY: 0 } })
    ).toMatch(/no photo/);
    expect(refusal({ ...made, stampMask: [1] })).toMatch(/shape/);
    expect(refusal({ ...made, stampMask: [1, 2] })).toMatch(/shape/);
    expect(refusal({ ...made, stampMask: [0, 0] })).toMatch(/nothing in it/);
    expect(refusal({ ...made, cellPalette: [E, E] })).toMatch(/nothing in it/);
    expect(refusal(made)).toBeNull();
  });

  it("empties a cell outside its shape, and drops a shape that is the whole box", () => {
    const made = JSON.parse(serializeStamp(stampFromPiece(chart(), liftSelection(chart(), { x: 0, y: 0, width: 2, height: 1 }), "a")!));
    const masked = readStampUpload(JSON.stringify({ ...made, stampMask: [0, 1] }));
    if ("error" in masked) throw new Error(masked.error);
    expect(Array.from(masked.stamp.pattern.cellPalette)).toEqual([E, 1]);
    const whole = readStampUpload(JSON.stringify({ ...made, stampMask: [1, 1] }));
    if ("error" in whole) throw new Error(whole.error);
    expect(whole.stamp.mask).toBeUndefined();
  });
});

describe("names, facts and the limit", () => {
  it("names a stamp as a chart is named", () => {
    expect(stampName("   ")).toBe(UNTITLED_STAMP);
    expect(stampName(7)).toBe(UNTITLED_STAMP);
    expect(stampName("x".repeat(150))).toHaveLength(100);
  });

  it("states a card's facts", () => {
    expect(stampFacts({ width: 24, height: 18, colors: 5, backstitch: true })).toBe("24 × 18 · 5 threads · backstitch");
    expect(stampFacts({ width: 3, height: 3, colors: 1, backstitch: false })).toBe("3 × 3 · 1 thread");
  });

  it("refuses one stamp more than the person's limit allows, by name", () => {
    const limit = limitById(STAMP_COUNT_LIMIT)!;
    expect(limit).toMatchObject({ unit: "stamps", siteDefault: 100 });
    expect(countRefusal(99, 100)).toBeNull();
    expect(countRefusal(100, 100)).toMatch(/You keep 100 stamps, as many as your account allows/);
    expect(countRefusal(0, 0)).toMatch(/You keep 0 stamps/);
    expect(countRefusal(5000, "unlimited")).toBeNull();
  });
});

describe("the account's Stamps", () => {
  it("counts, searches by every word in the name, and asks for a preview at its version", () => {
    expect(stampCount(1)).toBe("1 stamp");
    expect(stampCount(0)).toBe("0 stamps");
    const kept = [{ name: "Rose border" }, { name: "Little rose" }, { name: "Tulip" }];
    expect(stampsShown(kept, "  ROSE ").map((s) => s.name)).toEqual(["Rose border", "Little rose"]);
    expect(stampsShown(kept, "rose bor").map((s) => s.name)).toEqual(["Rose border"]);
    expect(stampsShown(kept, "")).toHaveLength(3);
    expect(stampPreviewHref("a b", 3)).toBe(`/api/stamps/a%20b/preview?v=3.${PREVIEW_DRAWING}`);
  });
});
