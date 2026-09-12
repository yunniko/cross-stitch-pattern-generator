import { describe, expect, it } from "vitest";
import { deserializePattern, serializePattern } from "@/lib/pattern-serialize";
import { EMPTY_CELL, MAX_STITCHES, type PaletteColor, type StitchPattern } from "@/lib/types";

function makePattern(): StitchPattern {
  const palette: PaletteColor[] = [
    { index: 0, rgb: [10, 20, 30], symbol: "x", name: "Alpha", count: 2 },
    { index: 1, rgb: [200, 150, 100], symbol: "0", name: "Beta", count: 2 },
  ];
  return {
    width: 2,
    height: 2,
    cellPalette: Uint8Array.from([0, 1, 1, 0]),
    palette,
    isLandscape: false,
  };
}

describe("pattern-serialize", () => {
  it("round-trips a pattern exactly", () => {
    const pattern = makePattern();
    const restored = deserializePattern(serializePattern(pattern));

    expect(restored.width).toBe(pattern.width);
    expect(restored.height).toBe(pattern.height);
    expect(restored.isLandscape).toBe(pattern.isLandscape);
    expect(Array.from(restored.cellPalette)).toEqual(Array.from(pattern.cellPalette));
    expect(restored.palette.map((c) => ({ rgb: c.rgb, symbol: c.symbol, name: c.name }))).toEqual(
      pattern.palette.map((c) => ({ rgb: c.rgb, symbol: c.symbol, name: c.name }))
    );
    // Counts are recomputed from cellPalette, not stored -- should still match.
    expect(restored.palette.map((c) => c.count)).toEqual(pattern.palette.map((c) => c.count));
  });

  it("round-trips the pattern's own name", () => {
    const pattern = { ...makePattern(), name: "My Cat" };
    const restored = deserializePattern(serializePattern(pattern));
    expect(restored.name).toBe("My Cat");
  });

  it("leaves name undefined for a file saved before this field existed", () => {
    const bad = JSON.stringify({
      width: 1,
      height: 1,
      cellPalette: [0],
      palette: [{ rgb: [0, 0, 0], symbol: "x", name: "A" }],
    });
    expect(deserializePattern(bad).name).toBeUndefined();
  });

  it("rejects invalid JSON", () => {
    expect(() => deserializePattern("not json")).toThrow();
  });

  it("rejects a cellPalette length mismatch", () => {
    const bad = JSON.stringify({ width: 2, height: 2, cellPalette: [0, 0, 0], palette: [{ rgb: [0, 0, 0], symbol: "x", name: "A" }] });
    expect(() => deserializePattern(bad)).toThrow();
  });

  it("rejects a cellPalette index outside the palette range", () => {
    const bad = JSON.stringify({ width: 1, height: 1, cellPalette: [5], palette: [{ rgb: [0, 0, 0], symbol: "x", name: "A" }] });
    expect(() => deserializePattern(bad)).toThrow();
  });

  it("rejects an empty palette", () => {
    const bad = JSON.stringify({ width: 1, height: 1, cellPalette: [0], palette: [] });
    expect(() => deserializePattern(bad)).toThrow();
  });

  it("rejects dimensions exceeding MAX_STITCHES, even though the file's own cellPalette is internally consistent", () => {
    const oversized = MAX_STITCHES + 1;
    const bad = JSON.stringify({
      width: oversized,
      height: 1,
      cellPalette: new Array(oversized).fill(0),
      palette: [{ rgb: [0, 0, 0], symbol: "x", name: "A" }],
    });
    expect(() => deserializePattern(bad)).toThrow(/exceed the maximum/);
  });

  it("accepts dimensions exactly at MAX_STITCHES", () => {
    const bad = JSON.stringify({
      width: MAX_STITCHES,
      height: 1,
      cellPalette: new Array(MAX_STITCHES).fill(0),
      palette: [{ rgb: [0, 0, 0], symbol: "x", name: "A" }],
    });
    expect(() => deserializePattern(bad)).not.toThrow();
  });

  it("round-trips an embedded sourceImage (G-012)", () => {
    const pattern = {
      ...makePattern(),
      sourceImage: {
        dataUrl: "data:image/png;base64,AAAA",
        naturalWidth: 800,
        naturalHeight: 600,
        cellSizePx: 8,
        offsetX: 0,
        offsetY: 0,
      },
    };
    const restored = deserializePattern(serializePattern(pattern));
    expect(restored.sourceImage).toEqual(pattern.sourceImage);
  });

  it("leaves sourceImage undefined for a file saved before G-012", () => {
    const restored = deserializePattern(serializePattern(makePattern()));
    expect(restored.sourceImage).toBeUndefined();
  });

  it("ignores a malformed sourceImage rather than rejecting the whole file", () => {
    const bad = JSON.stringify({
      width: 1,
      height: 1,
      cellPalette: [0],
      palette: [{ rgb: [0, 0, 0], symbol: "x", name: "A" }],
      sourceImage: { dataUrl: "not-a-data-url", naturalWidth: 10, naturalHeight: 10, cellSizePx: 1, offsetX: 0, offsetY: 0 },
    });
    const restored = deserializePattern(bad);
    expect(restored.sourceImage).toBeUndefined();
  });

  it("round-trips threadBrand: 'dmc' (G-016, generalized from dmcMode in G-029 M1)", () => {
    const pattern = { ...makePattern(), threadBrand: "dmc" as const };
    const restored = deserializePattern(serializePattern(pattern));
    expect(restored.threadBrand).toBe("dmc");
  });

  it("leaves threadBrand undefined for a file saved before G-016", () => {
    const restored = deserializePattern(serializePattern(makePattern()));
    expect(restored.threadBrand).toBeUndefined();
  });

  it("round-trips threadBrand: 'cosmo' (G-029 M2)", () => {
    const pattern = { ...makePattern(), threadBrand: "cosmo" as const };
    const restored = deserializePattern(serializePattern(pattern));
    expect(restored.threadBrand).toBe("cosmo");
  });

  it("never writes the legacy dmcMode field for a newly-serialized file", () => {
    const pattern = { ...makePattern(), threadBrand: "dmc" as const };
    const data = JSON.parse(serializePattern(pattern));
    expect(data).not.toHaveProperty("dmcMode");
    expect(data.threadBrand).toBe("dmc");
  });

  it("reads a real pre-G-029 file's legacy dmcMode: true as threadBrand: 'dmc' (HANDOVER.md D92 backward-compat requirement) -- fed a literal old-format DTO, not round-tripped through today's writer", () => {
    const legacyFile = JSON.stringify({
      formatVersion: 4,
      width: 1,
      height: 1,
      cellPalette: [0],
      palette: [{ rgb: [0, 0, 0], symbol: "x", name: "310 - Black" }],
      dmcMode: true,
    });
    expect(deserializePattern(legacyFile).threadBrand).toBe("dmc");
  });

  it("rejects an unrecognized threadBrand value rather than storing an invalid brand that would later crash a lookup", () => {
    const tampered = JSON.stringify({ ...JSON.parse(serializePattern(makePattern())), threadBrand: "rainbow" });
    expect(deserializePattern(tampered).threadBrand).toBeUndefined();
  });

  it("prefers a present threadBrand over a stale/contradictory legacy dmcMode on the same file", () => {
    const both = JSON.stringify({ ...JSON.parse(serializePattern({ ...makePattern(), threadBrand: "dmc" as const })), dmcMode: false });
    expect(deserializePattern(both).threadBrand).toBe("dmc");
  });

  it("round-trips edgeMode: \"crisp\" (G-024 M5)", () => {
    const pattern = { ...makePattern(), edgeMode: "crisp" as const };
    const restored = deserializePattern(serializePattern(pattern));
    expect(restored.edgeMode).toBe("crisp");
  });

  it("leaves edgeMode undefined for a file saved before G-024 M5, or any non-\"crisp\" value", () => {
    const restored = deserializePattern(serializePattern(makePattern()));
    expect(restored.edgeMode).toBeUndefined();

    const tampered = JSON.stringify({ ...JSON.parse(serializePattern(makePattern())), edgeMode: "chunky" });
    expect(deserializePattern(tampered).edgeMode).toBeUndefined();
  });

  it("round-trips an EMPTY_CELL stitch without rejecting the file (G-012 M5)", () => {
    const pattern = { ...makePattern(), cellPalette: Uint8Array.from([EMPTY_CELL, 1, 1, 0]) };
    const restored = deserializePattern(serializePattern(pattern));
    expect(Array.from(restored.cellPalette)).toEqual([EMPTY_CELL, 1, 1, 0]);
    // EMPTY_CELL cells aren't counted against any real color.
    expect(restored.palette.map((c) => c.count)).toEqual([1, 2]);
  });

  it("still rejects a genuinely out-of-range index that isn't EMPTY_CELL", () => {
    const bad = JSON.stringify({
      width: 1,
      height: 1,
      cellPalette: [200], // not EMPTY_CELL (255), and out of this 1-color palette's range
      palette: [{ rgb: [0, 0, 0], symbol: "x", name: "A" }],
    });
    expect(() => deserializePattern(bad)).toThrow();
  });
});
