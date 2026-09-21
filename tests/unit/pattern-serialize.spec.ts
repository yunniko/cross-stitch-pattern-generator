import { describe, expect, it } from "vitest";
import { deserializePattern, serializePattern } from "@/lib/editor/pattern-serialize";
import { formatThreadName, THREAD_BRANDS, type ThreadBrand } from "@/lib/threads/thread-brands";
import { EMPTY_CELL, MAX_COLORS, MAX_STITCHES, type PaletteColor, type StitchPattern } from "@/lib/types";

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

/** The sample pattern locked to `brand`: a lock means every color is that brand's thread, with its source (D122). */
function lockedTo(brand: ThreadBrand): StitchPattern {
  const base = makePattern();
  const threads = THREAD_BRANDS[brand].colors.slice(0, base.palette.length);
  return {
    ...base,
    threadBrand: brand,
    palette: base.palette.map((color, i) => ({ ...color, rgb: threads[i].rgb, name: formatThreadName(threads[i]), source: { brand, code: threads[i].code } })),
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
    const pattern = lockedTo("dmc");
    const restored = deserializePattern(serializePattern(pattern));
    expect(restored.threadBrand).toBe("dmc");
  });

  it("leaves threadBrand undefined for a file saved before G-016", () => {
    const restored = deserializePattern(serializePattern(makePattern()));
    expect(restored.threadBrand).toBeUndefined();
  });

  it("round-trips threadBrand: 'cosmo' (G-029 M2)", () => {
    const pattern = lockedTo("cosmo");
    const restored = deserializePattern(serializePattern(pattern));
    expect(restored.threadBrand).toBe("cosmo");
  });

  it("round-trips threadBrand: 'anchor' (G-029 M3)", () => {
    const pattern = lockedTo("anchor");
    const restored = deserializePattern(serializePattern(pattern));
    expect(restored.threadBrand).toBe("anchor");
  });

  it("never writes the legacy dmcMode field for a newly-serialized file", () => {
    const pattern = lockedTo("dmc");
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
    const both = JSON.stringify({ ...JSON.parse(serializePattern(lockedTo("dmc"))), dmcMode: false });
    expect(deserializePattern(both).threadBrand).toBe("dmc");
  });

  it("round-trips edgeMode: \"crisp\" (G-024 M5)", () => {
    const pattern = { ...makePattern(), edgeMode: "crisp" as const };
    const restored = deserializePattern(serializePattern(pattern));
    expect(restored.edgeMode).toBe("crisp");
  });

  it("round-trips edgeMode: \"crisp-plus\" (G-038)", () => {
    const pattern = { ...makePattern(), edgeMode: "crisp-plus" as const };
    expect(deserializePattern(serializePattern(pattern)).edgeMode).toBe("crisp-plus");
  });

  it("leaves edgeMode undefined for a file saved before G-024 M5, or any unknown value", () => {
    const restored = deserializePattern(serializePattern(makePattern()));
    expect(restored.edgeMode).toBeUndefined();

    const tampered = JSON.stringify({ ...JSON.parse(serializePattern(makePattern())), edgeMode: "chunky" });
    expect(deserializePattern(tampered).edgeMode).toBeUndefined();
  });

  it("round-trips ditherMode, and leaves it undefined for a file saved before G-052 or holding an unknown value", () => {
    const pattern = { ...makePattern(), ditherMode: "blue-noise-16" as const };
    expect(deserializePattern(serializePattern(pattern)).ditherMode).toBe("blue-noise-16");

    expect(deserializePattern(serializePattern(makePattern())).ditherMode).toBeUndefined();
    const tampered = JSON.stringify({ ...JSON.parse(serializePattern(makePattern())), ditherMode: "halftone-spiral" });
    expect(deserializePattern(tampered).ditherMode).toBeUndefined();
  });

  it("round-trips an EMPTY_CELL stitch without rejecting the file (G-012 M5)", () => {
    const pattern = { ...makePattern(), cellPalette: Uint8Array.from([EMPTY_CELL, 1, 1, 0]) };
    const restored = deserializePattern(serializePattern(pattern));
    expect(Array.from(restored.cellPalette)).toEqual([EMPTY_CELL, 1, 1, 0]);
    // EMPTY_CELL cells aren't counted against any real color.
    expect(restored.palette.map((c) => c.count)).toEqual([1, 2]);
  });

  // G-031 M1 (review B2): a palette longer than MAX_COLORS used to be
  // accepted, and Uint8Array.from then silently truncated cell index 260
  // to 4 and 255 to EMPTY_CELL.
  it("rejects a palette longer than MAX_COLORS instead of letting Uint8Array truncate the cell indices", () => {
    const palette = Array.from({ length: 300 }, (_, i) => ({ rgb: [i % 256, 0, 0], symbol: `s${i}`, name: `C${i}` }));
    const bad = JSON.stringify({ width: 2, height: 1, cellPalette: [260, 255], palette });
    expect(() => deserializePattern(bad)).toThrow(/more than the maximum/);
  });

  it("accepts a palette exactly at MAX_COLORS", () => {
    const palette = Array.from({ length: MAX_COLORS }, (_, i) => ({ rgb: [i, 0, 0], symbol: `s${i}`, name: `C${i}` }));
    const ok = JSON.stringify({ width: 1, height: 1, cellPalette: [MAX_COLORS - 1], palette });
    expect(deserializePattern(ok).palette).toHaveLength(MAX_COLORS);
  });

  // G-031 M1 (review B3): malformed entries used to be returned as-is and
  // only failed later, inside the renderer/legend.
  it.each([
    ["a non-array rgb", { rgb: "red", symbol: "x", name: "A" }],
    ["an rgb with two channels", { rgb: [1, 2], symbol: "x", name: "A" }],
    ["an rgb channel above 255", { rgb: [1, 2, 300], symbol: "x", name: "A" }],
    ["a fractional rgb channel", { rgb: [1, 2, 2.5], symbol: "x", name: "A" }],
    ["a null rgb channel", { rgb: [null, 0, 0], symbol: "x", name: "A" }],
    ["a numeric symbol", { rgb: [0, 0, 0], symbol: 1, name: "A" }],
    ["an empty symbol", { rgb: [0, 0, 0], symbol: "", name: "A" }],
    ["a null name", { rgb: [0, 0, 0], symbol: "x", name: null }],
    ["a non-object entry", "not a color"],
  ])("rejects a palette entry with %s", (_label, entry) => {
    const bad = JSON.stringify({ width: 1, height: 1, cellPalette: [0], palette: [entry] });
    expect(() => deserializePattern(bad)).toThrow();
  });

  it("rejects two palette colors sharing one symbol", () => {
    const bad = JSON.stringify({
      width: 2,
      height: 1,
      cellPalette: [0, 1],
      palette: [
        { rgb: [0, 0, 0], symbol: "x", name: "A" },
        { rgb: [9, 9, 9], symbol: "x", name: "B" },
      ],
    });
    expect(() => deserializePattern(bad)).toThrow(/same symbol/);
  });

  it("rejects fractional dimensions even when the cell count happens to match", () => {
    const bad = JSON.stringify({ width: 2.5, height: 2, cellPalette: [0, 0, 0, 0, 0], palette: [{ rgb: [0, 0, 0], symbol: "x", name: "A" }] });
    expect(() => deserializePattern(bad)).toThrow(/dimensions/);
  });

  it("rejects a fractional cell index", () => {
    const bad = JSON.stringify({ width: 1, height: 1, cellPalette: [0.5], palette: [{ rgb: [0, 0, 0], symbol: "x", name: "A" }] });
    expect(() => deserializePattern(bad)).toThrow();
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
