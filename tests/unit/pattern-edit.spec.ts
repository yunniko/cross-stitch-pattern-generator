import { describe, expect, it } from "vitest";
import { addColor, compactUnusedColors, editColorRgb, fillCluster, mergeColors, paintStitch } from "@/lib/pattern-edit";
import { MAX_COLORS, type PaletteColor, type RGB, type StitchPattern } from "@/lib/types";

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

describe("mergeColors", () => {
  it("reassigns every stitch of the source color to the target and removes the source from the palette", () => {
    // 2x2 grid: [0,1] / [1,2]
    const pattern = makePattern(2, 2, [0, 1, 1, 2], [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
    ]);
    const merged = mergeColors(pattern, 0, 1);

    expect(merged.palette).toHaveLength(2);
    expect(merged.palette.map((c) => c.rgb)).toEqual([
      [0, 255, 0],
      [0, 0, 255],
    ]);
    // Cell 0 (was color 0) should now be color 0 (the remapped target).
    expect(Array.from(merged.cellPalette)).toEqual([0, 0, 0, 1]);
    expect(merged.palette[0].count).toBe(3);
    expect(merged.palette[1].count).toBe(1);
  });

  it("is a no-op when source equals target", () => {
    const pattern = makePattern(1, 2, [0, 1], [
      [10, 10, 10],
      [20, 20, 20],
    ]);
    expect(mergeColors(pattern, 0, 0)).toBe(pattern);
  });
});

describe("fillCluster", () => {
  it("fills the whole connected component the clicked cell belongs to, not just that cell", () => {
    // 3x1 grid, all color 0 -- one connected cluster of 3 cells.
    const pattern = makePattern(3, 1, [0, 0, 0], [[100, 100, 100]]);
    const withNewColor = { ...pattern, palette: [...pattern.palette, { index: 1, rgb: [200, 50, 50] as RGB, symbol: "1", name: "New", count: 0 }] };
    const filled = fillCluster(withNewColor, 1, 1);

    expect(Array.from(filled.cellPalette)).toEqual([1, 1, 1]);
    expect(filled.palette[0].count).toBe(0);
    expect(filled.palette[1].count).toBe(3);
  });

  it("does not affect a same-colored but disconnected region", () => {
    // 3x1 grid: [0, 1, 0] -- the two color-0 cells are NOT 4-connected to each other.
    const pattern = makePattern(3, 1, [0, 1, 0], [
      [100, 100, 100],
      [200, 200, 200],
    ]);
    const withNewColor = { ...pattern, palette: [...pattern.palette, { index: 2, rgb: [50, 50, 200] as RGB, symbol: "2", name: "New", count: 0 }] };
    const filled = fillCluster(withNewColor, 0, 2);

    expect(Array.from(filled.cellPalette)).toEqual([2, 1, 0]);
  });
});

describe("paintStitch", () => {
  it("repaints exactly one cell", () => {
    const pattern = makePattern(2, 1, [0, 0], [
      [10, 10, 10],
      [20, 20, 20],
    ]);
    const painted = paintStitch(pattern, 1, 1);
    expect(Array.from(painted.cellPalette)).toEqual([0, 1]);
    expect(painted.palette[0].count).toBe(1);
    expect(painted.palette[1].count).toBe(1);
  });
});

describe("editColorRgb", () => {
  it("changes only the target color's RGB, leaving symbol/name/count untouched", () => {
    const pattern = makePattern(1, 1, [0], [[10, 10, 10]]);
    const edited = editColorRgb(pattern, 0, [255, 255, 255]);
    expect(edited.palette[0].rgb).toEqual([255, 255, 255]);
    expect(edited.palette[0].symbol).toBe(pattern.palette[0].symbol);
    expect(edited.palette[0].name).toBe(pattern.palette[0].name);
  });
});

describe("addColor", () => {
  it("appends a new zero-count color with an unused symbol and a name distinct from existing ones", () => {
    const pattern = makePattern(1, 1, [0], [[10, 10, 10]]);
    const withNew = addColor(pattern, [220, 30, 30]);
    expect(withNew.palette).toHaveLength(2);
    const added = withNew.palette[1];
    expect(added.count).toBe(0);
    expect(added.symbol).not.toBe(withNew.palette[0].symbol);
    expect(added.rgb).toEqual([220, 30, 30]);
  });

  it("refuses to add a color past MAX_COLORS", () => {
    const colors: RGB[] = Array.from({ length: MAX_COLORS }, (_, i) => [i, i, i] as RGB);
    const pattern = makePattern(MAX_COLORS, 1, colors.map((_, i) => i), colors);
    expect(() => addColor(pattern, [1, 2, 3])).toThrow();
  });
});

describe("compactUnusedColors", () => {
  it("drops zero-count colors and remaps remaining indices contiguously", () => {
    const pattern = makePattern(2, 1, [0, 2], [
      [10, 10, 10],
      [20, 20, 20], // unused
      [30, 30, 30],
    ]);
    const compacted = compactUnusedColors(pattern);
    expect(compacted.palette).toHaveLength(2);
    expect(compacted.palette.map((c) => c.rgb)).toEqual([
      [10, 10, 10],
      [30, 30, 30],
    ]);
    expect(Array.from(compacted.cellPalette)).toEqual([0, 1]);
  });

  it("is a no-op when every color is used", () => {
    const pattern = makePattern(2, 1, [0, 1], [
      [10, 10, 10],
      [20, 20, 20],
    ]);
    expect(compactUnusedColors(pattern)).toBe(pattern);
  });
});
