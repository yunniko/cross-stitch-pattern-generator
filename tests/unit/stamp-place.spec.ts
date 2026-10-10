import { describe, expect, it } from "vitest";
import { placeStamp } from "@/lib/stamps/place";
import type { StampContents } from "@/lib/stamps/stamp";
import { EMPTY_CELL, MAX_COLORS, type PaletteColor, type StitchPattern } from "@/lib/types";

/**
 * G-119 M4: a stamp placed in a chart. Its threads are found in the chart's palette by brand and code, or by colour for a
 * custom one; the ones the chart lacks are added at the end; a full palette and a chart smaller than the stamp refuse it
 * whole. Any chart takes any system's threads (G-131).
 */

const E = EMPTY_CELL;
const red: PaletteColor = { index: 0, rgb: [255, 0, 0], symbol: "A", name: "321 - Red", count: 0, source: { brand: "dmc", code: "321" } };
const ink: PaletteColor = { index: 1, rgb: [16, 32, 48], symbol: "B", name: "Ink", count: 0 };

/** A 3 x 2 stamp: red, a half stitch of ink, an empty cell, and below them nothing but a backstitch in ink. */
function stamp(mask?: number[]): StampContents {
  return {
    pattern: {
      width: 3,
      height: 2,
      cellPalette: Uint8Array.from([0, 1, E, E, E, E]),
      cellKind: Uint8Array.from([0, 2, 0, 0, 0, 0]),
      palette: [red, { ...ink, index: 1 }],
      isLandscape: true,
      name: "Bud",
      backstitch: [{ x1: 0, y1: 2, x2: 3, y2: 2, paletteIndex: 1 }],
    },
    ...(mask ? { mask: Uint8Array.from(mask) } : {}),
  };
}

/** A 10 x 8 empty chart with the given palette. */
function chart(palette: PaletteColor[], extra: Partial<StitchPattern> = {}): StitchPattern {
  return {
    width: 10,
    height: 8,
    cellPalette: new Uint8Array(80).fill(E),
    palette: palette.map((color, index) => ({ ...color, index })),
    isLandscape: true,
    ...extra,
  };
}

const green: PaletteColor = { index: 0, rgb: [0, 255, 0], symbol: "G", name: "Green", count: 0 };

describe("placing a stamp", () => {
  it("uses the chart's own thread where it has it and adds the rest at the end, keeping a custom colour's name", () => {
    const placed = placeStamp(chart([green, red]), stamp(), { x: 2, y: 1 });
    if ("error" in placed) throw new Error(placed.error);
    expect(placed.pattern.palette.map((color) => color.name)).toEqual(["Green", "321 - Red", "Ink"]);
    expect(placed.pattern.palette[2].rgb).toEqual([16, 32, 48]);
    expect(placed.pattern.palette[2].source).toBeUndefined();
    expect(Array.from(placed.piece.cells)).toEqual([1, 2, E, E, E, E]);
    expect(Array.from(placed.piece.kinds!)).toEqual([0, 2, 0, 0, 0, 0]);
    expect(placed.piece.backstitch).toEqual([{ x1: 0, y1: 2, x2: 3, y2: 2, paletteIndex: 2 }]);
    // Three stitches in from the corner in view, as lettering and a paste arrive.
    expect([placed.piece.x, placed.piece.y]).toEqual([5, 4]);
    expect(placed.piece.mask).toBeUndefined();
    expect(placed.piece.originRect).toBeUndefined();
  });

  it("finds a custom colour by its colour, and a thread by its brand and code whatever its name", () => {
    const placed = placeStamp(
      chart([
        { ...ink, name: "Night" },
        { ...red, name: "Mine", rgb: [250, 0, 0] },
      ]),
      stamp(),
      { x: 0, y: 0 }
    );
    if ("error" in placed) throw new Error(placed.error);
    expect(placed.pattern.palette).toHaveLength(2);
    expect(Array.from(placed.piece.cells)).toEqual([1, 0, E, E, E, E]);
  });

  it("adds a brand's thread from the brand's table, and a custom colour under a new name when the chart has its name", () => {
    const placed = placeStamp(chart([{ ...green, name: "Ink" }]), stamp(), { x: 0, y: 0 });
    if ("error" in placed) throw new Error(placed.error);
    const [, added, custom] = placed.pattern.palette;
    expect(added.source).toEqual({ brand: "dmc", code: "321" });
    expect(added.name).toMatch(/^321 - /);
    expect(custom.name).not.toBe("Ink");
    expect(new Set(placed.pattern.palette.map((color) => color.symbol)).size).toBe(3);
  });

  it("keeps the stamp's shape, and keeps it to the chart when the view's corner is near its edge", () => {
    const placed = placeStamp(chart([]), stamp([1, 1, 0, 1, 1, 1]), { x: 9, y: 7 });
    if ("error" in placed) throw new Error(placed.error);
    expect(Array.from(placed.piece.mask!)).toEqual([1, 1, 0, 1, 1, 1]);
    expect([placed.piece.x, placed.piece.y]).toEqual([7, 6]);
  });

  it("leaves the chart as it is when it has every thread", () => {
    const original = chart([red, ink]);
    const placed = placeStamp(original, stamp(), { x: 0, y: 0 });
    if ("error" in placed) throw new Error(placed.error);
    expect(placed.pattern).toBe(original);
  });

  it("is placed in a chart generated in another system, its threads keeping their own (G-131)", () => {
    const placed = placeStamp(chart([], { threadBrand: "anchor" }), stamp(), { x: 0, y: 0 });
    if ("error" in placed) throw new Error(placed.error);
    expect(placed.pattern.palette.map(({ name, source }) => ({ name, source }))).toEqual([
      { name: "321 - Red", source: { brand: "dmc", code: "321" } },
      { name: "Ink", source: undefined },
    ]);
  });

  it("is refused whole when the palette has no room for the threads it lacks", () => {
    const full = Array.from({ length: MAX_COLORS - 1 }, (_, i) => ({ ...green, rgb: [i, 1, 2] as const, name: `C${i}`, symbol: `s${i}` }));
    const original = chart(full);
    expect(placeStamp(original, stamp(), { x: 0, y: 0 })).toEqual({
      error: `The stamp needs 2 threads this chart does not have, and its palette has room for 1 more (of ${MAX_COLORS}), so it was not placed.`,
    });
    // With one of the two in the chart already, the other fits.
    expect("piece" in placeStamp(chart([...full.slice(1), red]), stamp(), { x: 0, y: 0 })).toBe(true);
  });

  it("is refused by a chart smaller than the stamp", () => {
    expect(placeStamp({ ...chart([]), width: 2, cellPalette: new Uint8Array(16).fill(E) }, stamp(), { x: 0, y: 0 })).toEqual({
      error: "The stamp is 3 × 2 stitches, larger than this chart (2 × 8), so it was not placed.",
    });
  });
});
