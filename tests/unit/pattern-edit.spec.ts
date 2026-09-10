import { describe, expect, it } from "vitest";
import { addColor, compactUnusedColors, editColorRgb, fillCluster, mergeColors, paintStitch, renameColor, renamePattern, resizeCanvas, shiftPattern } from "@/lib/pattern-edit";
import { EMPTY_CELL, MAX_COLORS, MAX_STITCHES, type PaletteColor, type RGB, type StitchPattern } from "@/lib/types";

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

describe("renameColor", () => {
  it("renames only the target color", () => {
    const pattern = makePattern(1, 1, [0], [[10, 10, 10]]);
    const renamed = renameColor(pattern, 0, "Pebble");
    expect(renamed.palette[0].name).toBe("Pebble");
  });

  it("trims surrounding whitespace", () => {
    const pattern = makePattern(1, 1, [0], [[10, 10, 10]]);
    const renamed = renameColor(pattern, 0, "  Pebble  ");
    expect(renamed.palette[0].name).toBe("Pebble");
  });

  it("is a no-op for a blank name", () => {
    const pattern = makePattern(1, 1, [0], [[10, 10, 10]]);
    expect(renameColor(pattern, 0, "   ")).toBe(pattern);
  });
});

describe("renamePattern", () => {
  it("sets the pattern's own name, distinct from any color's name", () => {
    const pattern = makePattern(1, 1, [0], [[10, 10, 10]]);
    const renamed = renamePattern(pattern, "My Cat");
    expect(renamed.name).toBe("My Cat");
    expect(renamed.palette[0].name).toBe(pattern.palette[0].name);
  });

  it("trims surrounding whitespace", () => {
    const pattern = makePattern(1, 1, [0], [[10, 10, 10]]);
    expect(renamePattern(pattern, "  My Cat  ").name).toBe("My Cat");
  });

  it("is a no-op for a blank name", () => {
    const pattern = makePattern(1, 1, [0], [[10, 10, 10]]);
    expect(renamePattern(pattern, "   ")).toBe(pattern);
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

describe("shiftPattern", () => {
  it("cyclically wraps stitch content by (dx, dy) instead of leaving gaps", () => {
    // 3x1: [A, B, C] shifted right by 1 -> [C, A, B].
    const pattern = makePattern(3, 1, [0, 1, 2], [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
    ]);
    const shifted = shiftPattern(pattern, 1, 0);
    expect(Array.from(shifted.cellPalette)).toEqual([2, 0, 1]);
  });

  it("wraps in both axes at once", () => {
    // 2x2: [[0,1],[2,3]] shifted by (1,1) -> [[3,2],[1,0]].
    const pattern = makePattern(2, 2, [0, 1, 2, 3], [
      [10, 10, 10],
      [20, 20, 20],
      [30, 30, 30],
      [40, 40, 40],
    ]);
    const shifted = shiftPattern(pattern, 1, 1);
    expect(Array.from(shifted.cellPalette)).toEqual([3, 2, 1, 0]);
  });

  it("is a no-op for a zero shift", () => {
    const pattern = makePattern(2, 1, [0, 1], [
      [10, 10, 10],
      [20, 20, 20],
    ]);
    expect(shiftPattern(pattern, 0, 0)).toBe(pattern);
  });

  it("preserves every color's stitch count -- only positions move", () => {
    const pattern = makePattern(3, 2, [0, 0, 1, 1, 1, 0], [
      [10, 10, 10],
      [20, 20, 20],
    ]);
    const shifted = shiftPattern(pattern, 2, -1);
    expect(shifted.palette.map((c) => c.count)).toEqual(pattern.palette.map((c) => c.count));
  });

  it("moves the source photo's offset by the same amount, keeping it locked to the grid", () => {
    const base = makePattern(2, 1, [0, 1], [
      [10, 10, 10],
      [20, 20, 20],
    ]);
    const pattern = { ...base, sourceImage: { dataUrl: "data:image/png;base64,AA", naturalWidth: 20, naturalHeight: 10, cellSizePx: 10, offsetX: 3, offsetY: -2 } };
    const shifted = shiftPattern(pattern, 1, 4);
    expect(shifted.sourceImage).toEqual({ ...pattern.sourceImage, offsetX: 4, offsetY: 2 });
  });

  it("leaves an absent sourceImage absent after a shift", () => {
    const pattern = makePattern(2, 1, [0, 1], [
      [10, 10, 10],
      [20, 20, 20],
    ]);
    expect(shiftPattern(pattern, 1, 0).sourceImage).toBeUndefined();
  });
});

describe("resizeCanvas", () => {
  it("crops an edge, dropping the cells on that side and shrinking the grid", () => {
    // 3x1: [A, B, C] cropped by 1 on the left -> 2x1: [B, C].
    const pattern = makePattern(3, 1, [0, 1, 2], [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
    ]);
    const resized = resizeCanvas(pattern, { left: -1, right: 0, top: 0, bottom: 0 }, [0, 0, 0]);
    expect(resized.width).toBe(2);
    expect(resized.height).toBe(1);
    expect(Array.from(resized.cellPalette)).toEqual([1, 2]);
  });

  it("expands an edge, filling new cells with the given color (reusing an existing palette entry if it matches)", () => {
    const pattern = makePattern(2, 1, [0, 1], [
      [255, 0, 0],
      [0, 255, 0],
    ]);
    const resized = resizeCanvas(pattern, { left: 1, right: 0, top: 0, bottom: 0 }, [255, 0, 0]);
    expect(resized.width).toBe(3);
    // New cell reuses color 0 (exact RGB match) rather than adding a duplicate.
    expect(resized.palette).toHaveLength(2);
    expect(Array.from(resized.cellPalette)).toEqual([0, 0, 1]);
  });

  it("adds a brand-new palette color when the fill doesn't match any existing one", () => {
    const pattern = makePattern(2, 1, [0, 1], [
      [255, 0, 0],
      [0, 255, 0],
    ]);
    const resized = resizeCanvas(pattern, { left: 0, right: 1, top: 0, bottom: 0 }, [10, 20, 30]);
    expect(resized.palette).toHaveLength(3);
    expect(resized.palette[2].rgb).toEqual([10, 20, 30]);
    expect(Array.from(resized.cellPalette)).toEqual([0, 1, 2]);
  });

  it("expands on multiple edges and crops another in the same call", () => {
    // 2x2 -> expand 1 on the right, crop 1 off the top -> 3x1, keeping only the original bottom row plus a new column.
    const pattern = makePattern(2, 2, [0, 1, 2, 3], [
      [1, 1, 1],
      [2, 2, 2],
      [3, 3, 3],
      [4, 4, 4],
    ]);
    const resized = resizeCanvas(pattern, { left: 0, right: 1, top: -1, bottom: 0 }, [9, 9, 9]);
    expect(resized.width).toBe(3);
    expect(resized.height).toBe(1);
    expect(Array.from(resized.cellPalette)).toEqual([2, 3, 4]); // old row 1 ([2,3]) plus the new fill color (index 4)
  });

  it("moves the photo underlay's offset by the left/top deltas only", () => {
    const base = makePattern(2, 2, [0, 1, 1, 0], [
      [1, 1, 1],
      [2, 2, 2],
    ]);
    const pattern = { ...base, sourceImage: { dataUrl: "data:image/png;base64,AA", naturalWidth: 20, naturalHeight: 20, cellSizePx: 10, offsetX: 0, offsetY: 0 } };
    const resized = resizeCanvas(pattern, { left: 2, right: 3, top: -1, bottom: 4 }, [5, 5, 5]);
    expect(resized.sourceImage?.offsetX).toBe(2);
    expect(resized.sourceImage?.offsetY).toBe(-1);
  });

  it("rejects cropping away the entire pattern", () => {
    const pattern = makePattern(2, 1, [0, 1], [
      [1, 1, 1],
      [2, 2, 2],
    ]);
    expect(() => resizeCanvas(pattern, { left: -2, right: 0, top: 0, bottom: 0 }, [0, 0, 0])).toThrow(/entire pattern/);
  });

  it("rejects a resize that would exceed MAX_STITCHES", () => {
    const pattern = makePattern(1, 1, [0], [[1, 1, 1]]);
    expect(() => resizeCanvas(pattern, { left: 0, right: MAX_STITCHES, top: 0, bottom: 0 }, [0, 0, 0])).toThrow(/exceed the maximum/);
  });

  it("rejects expanding past MAX_COLORS when the fill color is new", () => {
    const colors: RGB[] = Array.from({ length: MAX_COLORS }, (_, i) => [i, i, i]);
    const pattern = makePattern(MAX_COLORS, 1, colors.map((_, i) => i), colors);
    expect(() => resizeCanvas(pattern, { left: 0, right: 1, top: 0, bottom: 0 }, [250, 250, 250])).toThrow(/maximum/);
  });

  it("recomputes stitch counts after a crop -- a color entirely cropped away drops to zero, not removed from the palette", () => {
    const pattern = makePattern(2, 1, [0, 1], [
      [1, 1, 1],
      [2, 2, 2],
    ]);
    const resized = resizeCanvas(pattern, { left: -1, right: 0, top: 0, bottom: 0 }, [0, 0, 0]);
    expect(resized.palette).toHaveLength(2); // color 0 stays in the palette
    expect(resized.palette[0].count).toBe(0);
    expect(resized.palette[1].count).toBe(1);
  });
});

describe("EMPTY_CELL (the empty-stitch pseudo-color, G-012 M5)", () => {
  it("paintStitch can paint a cell empty, and it isn't counted against any real color", () => {
    const pattern = makePattern(2, 1, [0, 1], [
      [1, 1, 1],
      [2, 2, 2],
    ]);
    const painted = paintStitch(pattern, 0, EMPTY_CELL);
    expect(Array.from(painted.cellPalette)).toEqual([EMPTY_CELL, 1]);
    expect(painted.palette[0].count).toBe(0);
    expect(painted.palette[1].count).toBe(1);
  });

  it("fillCluster can fill a connected region as empty", () => {
    // 3x1, all one color -> fill the whole (single) region empty.
    const pattern = makePattern(3, 1, [0, 0, 0], [[1, 1, 1]]);
    const filled = fillCluster(pattern, 1, EMPTY_CELL);
    expect(Array.from(filled.cellPalette)).toEqual([EMPTY_CELL, EMPTY_CELL, EMPTY_CELL]);
    expect(filled.palette[0].count).toBe(0);
  });

  it("mergeColors leaves empty cells untouched and doesn't corrupt them via the palette-index remap", () => {
    // 3x1: [empty, color0, color1] -- merging color0 into color1 must not
    // disturb the empty cell, and must not silently turn it into color 0
    // via an out-of-bounds remap read (the bug this test guards against).
    const pattern = makePattern(3, 1, [EMPTY_CELL, 0, 1], [
      [1, 1, 1],
      [2, 2, 2],
    ]);
    const merged = mergeColors(pattern, 0, 1);
    expect(Array.from(merged.cellPalette)).toEqual([EMPTY_CELL, 0, 0]); // color1 remapped to index 0 after color0's removal
  });

  it("compactUnusedColors leaves empty cells untouched and doesn't corrupt them via the palette-index remap", () => {
    const pattern = makePattern(3, 1, [EMPTY_CELL, 1, 1], [
      [1, 1, 1], // unused -- will be compacted away
      [2, 2, 2],
    ]);
    const compacted = compactUnusedColors(pattern);
    expect(compacted.palette).toHaveLength(1);
    expect(Array.from(compacted.cellPalette)).toEqual([EMPTY_CELL, 0, 0]);
  });

  it("shiftPattern (Move) carries empty cells through a wrap-around shift unchanged", () => {
    const pattern = makePattern(3, 1, [EMPTY_CELL, 0, 1], [
      [1, 1, 1],
      [2, 2, 2],
    ]);
    const shifted = shiftPattern(pattern, 1, 0);
    expect(Array.from(shifted.cellPalette)).toEqual([1, EMPTY_CELL, 0]);
  });

  it("resizeCanvas carries empty cells through a crop/expand unchanged", () => {
    const pattern = makePattern(3, 1, [EMPTY_CELL, 0, 1], [
      [1, 1, 1],
      [2, 2, 2],
    ]);
    const resized = resizeCanvas(pattern, { left: 0, right: 1, top: 0, bottom: 0 }, [9, 9, 9]);
    expect(Array.from(resized.cellPalette)).toEqual([EMPTY_CELL, 0, 1, 2]); // new cell is the real fill color, not empty
  });
});
