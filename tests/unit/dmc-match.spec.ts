import { describe, expect, it } from "vitest";
import { DMC_COLORS } from "@/lib/dmc-colors";
import { applyDmcPalette, nearestDmcColor } from "@/lib/dmc-match";
import type { PaletteColor, RGB, StitchPattern } from "@/lib/types";

function makePattern(width: number, height: number, cellPalette: number[], colors: RGB[]): StitchPattern {
  const counts = new Array(colors.length).fill(0);
  for (const i of cellPalette) counts[i]++;
  const palette: PaletteColor[] = colors.map((rgb, i) => ({
    index: i,
    rgb,
    symbol: String(i),
    name: `Color ${i}`,
    count: counts[i],
  }));
  return { width, height, cellPalette: Uint8Array.from(cellPalette), palette, isLandscape: width >= height };
}

describe("DMC_COLORS", () => {
  it("has 454 colors (the full standard DMC stranded cotton line), all with unique codes", () => {
    expect(DMC_COLORS).toHaveLength(454);
    expect(new Set(DMC_COLORS.map((c) => c.code)).size).toBe(454);
  });

  it("includes a few well-known reference colors at their known values", () => {
    expect(DMC_COLORS.find((c) => c.code === "310")).toEqual({ code: "310", name: "Black", rgb: [0, 0, 0] });
    expect(DMC_COLORS.find((c) => c.code === "B5200")?.rgb).toEqual([255, 255, 255]);
  });
});

describe("nearestDmcColor", () => {
  it("returns the exact match when the RGB is already a real DMC color", () => {
    expect(nearestDmcColor([0, 0, 0]).code).toBe("310"); // Black
  });

  it("finds the closest color for an RGB that isn't an exact DMC value", () => {
    // Just barely off pure black -- should still land on 310 Black, not
    // some unrelated dark color.
    expect(nearestDmcColor([1, 1, 2]).code).toBe("310");
  });
});

describe("applyDmcPalette", () => {
  it("replaces every color with its nearest real DMC thread color and renames it 'CODE - Name'", () => {
    // A 2-color pattern: pure black and pure white, both already exact DMC values.
    const pattern = makePattern(2, 1, [0, 1], [
      [0, 0, 0],
      [255, 255, 255],
    ]);
    const dmc = applyDmcPalette(pattern);
    const names = dmc.palette.map((c) => c.name).sort();
    expect(names).toEqual(["310 - Black", "B5200 - Snow White"]);
  });

  it("sets dmcMode: true on the returned pattern (G-016)", () => {
    const pattern = makePattern(1, 1, [0], [[0, 0, 0]]);
    expect(applyDmcPalette(pattern).dmcMode).toBe(true);
  });

  it("merges two clusters that snap to the same DMC color into one palette entry with combined counts", () => {
    // Two very-slightly-different near-blacks that both snap to DMC 310.
    const pattern = makePattern(3, 1, [0, 0, 1], [
      [1, 1, 1],
      [2, 1, 2],
    ]);
    const dmc = applyDmcPalette(pattern);
    expect(dmc.palette).toHaveLength(1);
    expect(dmc.palette[0].name).toBe("310 - Black");
    expect(dmc.palette[0].count).toBe(3); // all 3 cells, from both original clusters
    expect(Array.from(dmc.cellPalette)).toEqual([0, 0, 0]);
  });

  it("keeps distinct colors separate when they snap to different DMC codes", () => {
    const pattern = makePattern(2, 1, [0, 1], [
      [0, 0, 0],
      [255, 255, 255],
    ]);
    const dmc = applyDmcPalette(pattern);
    expect(dmc.palette).toHaveLength(2);
    expect(new Set(dmc.cellPalette)).toEqual(new Set([0, 1]));
  });

  it("sorts the resulting palette dark-to-light, matching every other mode's legend convention", () => {
    const pattern = makePattern(2, 1, [0, 1], [
      [255, 255, 255], // white listed first in cellPalette/palette...
      [0, 0, 0], // ...but black must come first in the sorted output
    ]);
    const dmc = applyDmcPalette(pattern);
    expect(dmc.palette[0].name).toBe("310 - Black");
    expect(dmc.palette[1].name).toBe("B5200 - Snow White");
  });

  it("assigns fresh, distinct symbols to the (possibly smaller) merged palette", () => {
    const pattern = makePattern(3, 1, [0, 0, 1], [
      [1, 1, 1],
      [255, 255, 255],
    ]);
    const dmc = applyDmcPalette(pattern);
    const symbols = dmc.palette.map((c) => c.symbol);
    expect(new Set(symbols).size).toBe(symbols.length);
  });

  it("preserves width/height/isLandscape and leaves an empty pattern's palette alone", () => {
    const pattern = makePattern(4, 2, [0, 0, 0, 0, 0, 0, 0, 0], [[10, 10, 10]]);
    const dmc = applyDmcPalette(pattern);
    expect(dmc.width).toBe(4);
    expect(dmc.height).toBe(2);
    expect(dmc.isLandscape).toBe(true);

    const empty = { ...pattern, palette: [] };
    expect(applyDmcPalette(empty)).toBe(empty);
  });
});
