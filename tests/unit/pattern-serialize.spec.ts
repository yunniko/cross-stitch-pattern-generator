import { describe, expect, it } from "vitest";
import { deserializePattern, serializePattern } from "@/lib/pattern-serialize";
import type { PaletteColor, StitchPattern } from "@/lib/types";

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
});
