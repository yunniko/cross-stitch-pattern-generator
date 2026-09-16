import { describe, expect, it } from "vitest";
import { createBlankPattern, describeBlankSizeProblem, isPhotoFree, isValidBlankSize } from "@/lib/editor/blank-pattern";
import { deserializePattern, serializePattern } from "@/lib/editor/pattern-serialize";
import { EMPTY_CELL, MAX_STITCHES, MIN_STITCHES } from "@/lib/types";

/** G-040 M1: charts started from nothing, and the rule that a chart without a photo can never be generated. */

describe("createBlankPattern", () => {
  it("makes a chart of the asked size with every stitch empty, no colours and no photo", () => {
    const pattern = createBlankPattern(30, 20);
    expect(pattern.width).toBe(30);
    expect(pattern.height).toBe(20);
    expect(pattern.cellPalette).toHaveLength(600);
    expect(pattern.cellPalette.every((cell) => cell === EMPTY_CELL)).toBe(true);
    expect(pattern.palette).toEqual([]);
    expect(pattern.sourceImage).toBeUndefined();
    expect(pattern.isLandscape).toBe(true);
    expect(pattern.name).toBe("cross-stitch-pattern");
  });

  it("marks a taller chart as not landscape, and keeps a given name", () => {
    const pattern = createBlankPattern(20, 30, "My sampler");
    expect(pattern.isLandscape).toBe(false);
    expect(pattern.name).toBe("My sampler");
  });

  it("accepts the same size range as a generated chart", () => {
    expect(isValidBlankSize(MIN_STITCHES)).toBe(true);
    expect(isValidBlankSize(MAX_STITCHES)).toBe(true);
    expect(isValidBlankSize(MIN_STITCHES - 1)).toBe(false);
    expect(isValidBlankSize(MAX_STITCHES + 1)).toBe(false);
    expect(isValidBlankSize(40.5)).toBe(false);
  });

  it.each([
    [5, 20, /Width must be between/],
    [20, 5, /Height must be between/],
    [20.5, 20, /Width must be a whole number/],
    [20, Number.NaN, /Height must be a whole number/],
  ])("refuses %s × %s with a message the form can show", (width, height, expected) => {
    expect(describeBlankSizeProblem(width, height)).toMatch(expected);
    expect(() => createBlankPattern(width, height)).toThrow(expected);
  });

  it("accepts a valid size with no complaint", () => {
    expect(describeBlankSizeProblem(100, 100)).toBeNull();
  });
});

describe("isPhotoFree", () => {
  it("is true for a blank chart and false once a photo is attached", () => {
    const blank = createBlankPattern(10, 10);
    expect(isPhotoFree(blank)).toBe(true);
    expect(isPhotoFree({ ...blank, sourceImage: { dataUrl: "data:,", naturalWidth: 4, naturalHeight: 4, cellSizePx: 1, offsetX: 0, offsetY: 0 } })).toBe(false);
  });

  it("is false without a chart at all", () => {
    expect(isPhotoFree(null)).toBe(false);
  });
});

describe("saving a blank chart", () => {
  it("survives a save and reopen with its size, empty stitches and empty palette", () => {
    const pattern = createBlankPattern(24, 16, "Blank");
    const restored = deserializePattern(serializePattern(pattern));
    expect(restored.width).toBe(24);
    expect(restored.height).toBe(16);
    expect(restored.palette).toEqual([]);
    expect(restored.cellPalette.every((cell) => cell === EMPTY_CELL)).toBe(true);
    expect(restored.sourceImage).toBeUndefined();
    expect(isPhotoFree(restored)).toBe(true);
    expect(restored.name).toBe("Blank");
  });

  it("still refuses a file whose stitches name a colour its palette doesn't have", () => {
    const tampered = JSON.stringify({ ...JSON.parse(serializePattern(createBlankPattern(10, 10))), cellPalette: [0, ...new Array(99).fill(EMPTY_CELL)] });
    expect(() => deserializePattern(tampered)).toThrow(/isn't in its own palette/);
  });

  it("still refuses a file with no palette field at all", () => {
    const withoutPalette = JSON.stringify({ ...JSON.parse(serializePattern(createBlankPattern(10, 10))), palette: undefined });
    expect(() => deserializePattern(withoutPalette)).toThrow(/no color palette/);
  });
});
