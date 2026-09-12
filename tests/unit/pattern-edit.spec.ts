import { describe, expect, it } from "vitest";
import {
  addBrandColor,
  addColor,
  compactUnusedColors,
  compositeSelectionPreview,
  editColorRgb,
  editColorToBrandColor,
  fillCluster,
  fillClusterDiagonal,
  flipSelectionHorizontal,
  flipSelectionVertical,
  liftSelection,
  mergeColors,
  mergeSelection,
  moveSelection,
  paintStitch,
  renameColor,
  renamePattern,
  resizeCanvas,
  setColorSymbol,
  shiftPattern,
} from "@/lib/pattern-edit";
import { EMPTY_CELL, MAX_COLORS, MAX_STITCHES, type FloatingSelection, type PaletteColor, type RGB, type StitchPattern } from "@/lib/types";

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

  it("merging a color into EMPTY_CELL turns its stitches empty and removes it from the palette (Owner request 2026-09-12)", () => {
    // 2x2 grid: [0,1] / [1,2] -- merge color 1 (the middle one) into empty.
    const pattern = makePattern(2, 2, [0, 1, 1, 2], [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
    ]);
    const merged = mergeColors(pattern, 1, EMPTY_CELL);

    expect(merged.palette).toHaveLength(2);
    expect(merged.palette.map((c) => c.rgb)).toEqual([
      [255, 0, 0],
      [0, 0, 255],
    ]);
    // Cells that held color 1 become EMPTY_CELL; the others remap down by one.
    expect(Array.from(merged.cellPalette)).toEqual([0, EMPTY_CELL, EMPTY_CELL, 1]);
    expect(merged.palette[0].count).toBe(1);
    expect(merged.palette[1].count).toBe(1);
  });

  it("merging a color into EMPTY_CELL leaves cells that were already empty untouched", () => {
    const pattern = makePattern(1, 3, [0, EMPTY_CELL, 1], [
      [10, 10, 10],
      [20, 20, 20],
    ]);
    const merged = mergeColors(pattern, 0, EMPTY_CELL);
    expect(Array.from(merged.cellPalette)).toEqual([EMPTY_CELL, EMPTY_CELL, 0]);
    expect(merged.palette).toHaveLength(1);
    expect(merged.palette[0].rgb).toEqual([20, 20, 20]);
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

describe("editColorToBrandColor", () => {
  it("changes the target color's rgb and renames it 'CODE - Name' to match", () => {
    const pattern = makePattern(1, 1, [0], [[10, 10, 10]]);
    const edited = editColorToBrandColor(pattern, 0, "310", "dmc"); // Black
    expect(edited.palette[0].rgb).toEqual([0, 0, 0]);
    expect(edited.palette[0].name).toBe("310 - Black");
  });

  it("leaves the symbol and other colors untouched", () => {
    const pattern = makePattern(1, 2, [0, 1], [
      [10, 10, 10],
      [20, 20, 20],
    ]);
    const edited = editColorToBrandColor(pattern, 0, "310", "dmc");
    expect(edited.palette[0].symbol).toBe(pattern.palette[0].symbol);
    expect(edited.palette[1]).toEqual(pattern.palette[1]);
  });

  it("does not set threadBrand -- converting one color doesn't make the whole pattern brand-matched", () => {
    const pattern = makePattern(1, 1, [0], [[10, 10, 10]]);
    expect(editColorToBrandColor(pattern, 0, "310", "dmc").threadBrand).toBeUndefined();
  });

  it("rejects a code that isn't a real DMC color", () => {
    const pattern = makePattern(1, 1, [0], [[10, 10, 10]]);
    expect(() => editColorToBrandColor(pattern, 0, "NOT-A-REAL-CODE", "dmc")).toThrow();
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

describe("addBrandColor", () => {
  it("appends a new zero-count color with the real DMC rgb and a 'CODE - Name' name", () => {
    const pattern = makePattern(1, 1, [0], [[10, 10, 10]]);
    const withNew = addBrandColor(pattern, "310", "dmc"); // Black
    expect(withNew.palette).toHaveLength(2);
    const added = withNew.palette[1];
    expect(added.count).toBe(0);
    expect(added.rgb).toEqual([0, 0, 0]);
    expect(added.name).toBe("310 - Black");
    expect(added.symbol).not.toBe(withNew.palette[0].symbol);
  });

  it("rejects a code that isn't a real DMC color", () => {
    const pattern = makePattern(1, 1, [0], [[10, 10, 10]]);
    expect(() => addBrandColor(pattern, "NOT-A-REAL-CODE", "dmc")).toThrow();
  });

  it("refuses to add a color past MAX_COLORS", () => {
    const colors: RGB[] = Array.from({ length: MAX_COLORS }, (_, i) => [i, i, i] as RGB);
    const pattern = makePattern(MAX_COLORS, 1, colors.map((_, i) => i), colors);
    expect(() => addBrandColor(pattern, "310", "dmc")).toThrow();
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

describe("setColorSymbol", () => {
  it("assigns the symbol when it isn't used by any other color", () => {
    const pattern = makePattern(1, 2, [0, 1], [
      [10, 10, 10],
      [20, 20, 20],
    ]);
    const result = setColorSymbol(pattern, 0, "★");
    expect(result.palette[0].symbol).toBe("★");
    expect(result.palette[1].symbol).toBe("1"); // untouched
  });

  it("swaps symbols with whichever color currently holds the requested one, never producing a duplicate", () => {
    const pattern = makePattern(1, 2, [0, 1], [
      [10, 10, 10],
      [20, 20, 20],
    ]);
    // Color 1 already owns symbol "1" -- asking color 0 to take it must
    // give color 0 "1" and hand color 1 color 0's old symbol ("0") back,
    // rather than leaving two colors both named "1".
    const result = setColorSymbol(pattern, 0, "1");
    expect(result.palette[0].symbol).toBe("1");
    expect(result.palette[1].symbol).toBe("0");
    expect(new Set(result.palette.map((c) => c.symbol)).size).toBe(2);
  });

  it("is a no-op when the color already has the requested symbol", () => {
    const pattern = makePattern(1, 1, [0], [[10, 10, 10]]);
    expect(setColorSymbol(pattern, 0, "0")).toBe(pattern);
  });

  it("leaves every other color's rgb/name/count untouched", () => {
    const pattern = makePattern(1, 2, [0, 1], [
      [10, 10, 10],
      [20, 20, 20],
    ]);
    const result = setColorSymbol(pattern, 0, "★");
    expect(result.palette[0].rgb).toEqual([10, 10, 10]);
    expect(result.palette[0].name).toBe("Color 0");
    expect(result.palette[1]).toEqual(pattern.palette[1]);
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

describe("fillClusterDiagonal (G-018 Fill tool)", () => {
  it("fills a diagonally-connected region that fillCluster (4-connected) would treat as separate", () => {
    // 0 1
    // 1 0
    const pattern = makePattern(2, 2, [0, 1, 1, 0], [
      [10, 10, 10],
      [20, 20, 20],
    ]);
    const filled = fillClusterDiagonal(pattern, 0, 1);
    // Both diagonal 0-cells (index 0 and 3) become color 1.
    expect(Array.from(filled.cellPalette)).toEqual([1, 1, 1, 1]);
  });

  it("does not spill into a differently-colored cell", () => {
    const pattern = makePattern(2, 2, [0, 0, 1, 1], [
      [10, 10, 10],
      [20, 20, 20],
    ]);
    const filled = fillClusterDiagonal(pattern, 0, 1);
    expect(Array.from(filled.cellPalette)).toEqual([1, 1, 1, 1]);
  });

  it("recomputes stitch counts for the affected colors", () => {
    const pattern = makePattern(2, 2, [0, 1, 1, 0], [
      [10, 10, 10],
      [20, 20, 20],
    ]);
    const filled = fillClusterDiagonal(pattern, 0, 1);
    expect(filled.palette[0].count).toBe(0);
    expect(filled.palette[1].count).toBe(4);
  });
});

describe("Rectangle Select tool (G-018): liftSelection / moveSelection / flip*", () => {
  function makeGridPattern(): StitchPattern {
    // A B C
    // D E F
    return makePattern(3, 2, [0, 1, 2, 3, 4, 5], [
      [0, 0, 0],
      [1, 1, 1],
      [2, 2, 2],
      [3, 3, 3],
      [4, 4, 4],
      [5, 5, 5],
    ]);
  }

  it("lifts a rectangle's cells and sets originRect to the same (clamped) area", () => {
    const pattern = makeGridPattern();
    const sel = liftSelection(pattern, { x: 1, y: 0, width: 2, height: 2 });
    expect(sel.x).toBe(1);
    expect(sel.y).toBe(0);
    expect(sel.width).toBe(2);
    expect(sel.height).toBe(2);
    expect(Array.from(sel.cells)).toEqual([1, 2, 4, 5]); // B C / E F
    expect(sel.originRect).toEqual({ x: 1, y: 0, width: 2, height: 2 });
  });

  it("clamps a rectangle that extends past the pattern's own bounds", () => {
    const pattern = makeGridPattern();
    const sel = liftSelection(pattern, { x: 2, y: 0, width: 5, height: 5 });
    expect(sel).toMatchObject({ x: 2, y: 0, width: 1, height: 2 });
    expect(Array.from(sel.cells)).toEqual([2, 5]); // C / F
  });

  it("moveSelection only changes position, not size/cells/originRect", () => {
    const pattern = makeGridPattern();
    const sel = liftSelection(pattern, { x: 0, y: 0, width: 2, height: 1 });
    const moved = moveSelection(sel, 1, 1);
    expect(moved.x).toBe(1);
    expect(moved.y).toBe(1);
    expect(moved.cells).toEqual(sel.cells);
    expect(moved.originRect).toEqual(sel.originRect);
  });

  it("flipSelectionHorizontal mirrors cells left-right without moving the selection", () => {
    const pattern = makeGridPattern();
    const sel = liftSelection(pattern, { x: 0, y: 0, width: 3, height: 1 }); // A B C
    const flipped = flipSelectionHorizontal(sel);
    expect(Array.from(flipped.cells)).toEqual([2, 1, 0]); // C B A
    expect(flipped.x).toBe(sel.x);
    expect(flipped.y).toBe(sel.y);
  });

  it("flipSelectionVertical mirrors cells top-bottom", () => {
    const pattern = makeGridPattern();
    const sel = liftSelection(pattern, { x: 0, y: 0, width: 1, height: 2 }); // A / D
    const flipped = flipSelectionVertical(sel);
    expect(Array.from(flipped.cells)).toEqual([3, 0]); // D / A
  });
});

describe("compositeSelectionPreview (G-018)", () => {
  it("overlays the selection's cells at its current position, leaving everything else untouched", () => {
    const pattern = makeGridPattern();
    const sel = liftSelection(pattern, { x: 0, y: 0, width: 1, height: 1 }); // just A
    const moved = moveSelection(sel, 2, 1); // move A's copy on top of F
    const preview = compositeSelectionPreview(pattern, moved);
    expect(Array.from(preview.cellPalette)).toEqual([0, 1, 2, 3, 4, 0]); // F replaced by A's value (0)
    // The base pattern itself is untouched (preview is a new object).
    expect(Array.from(pattern.cellPalette)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  function makeGridPattern(): StitchPattern {
    return makePattern(3, 2, [0, 1, 2, 3, 4, 5], [
      [0, 0, 0],
      [1, 1, 1],
      [2, 2, 2],
      [3, 3, 3],
      [4, 4, 4],
      [5, 5, 5],
    ]);
  }
});

describe("mergeSelection (G-018)", () => {
  function makeGridPattern(): StitchPattern {
    return makePattern(3, 2, [0, 1, 2, 3, 4, 5], [
      [0, 0, 0],
      [1, 1, 1],
      [2, 2, 2],
      [3, 3, 3],
      [4, 4, 4],
      [5, 5, 5],
    ]);
  }

  it("moving a selection vacates its originRect to EMPTY_CELL and stamps the destination", () => {
    const pattern = makeGridPattern();
    const sel = liftSelection(pattern, { x: 0, y: 0, width: 1, height: 1 }); // just A (value 0)
    const moved = moveSelection(sel, 2, 1); // move onto F's spot
    const merged = mergeSelection(pattern, moved);
    // A's original spot (index 0) is now empty; F's spot (index 5) now holds A's value (0).
    expect(Array.from(merged.cellPalette)).toEqual([EMPTY_CELL, 1, 2, 3, 4, 0]);
  });

  it("an unmoved selection round-trips back to the same content (safe no-op)", () => {
    const pattern = makeGridPattern();
    const sel = liftSelection(pattern, { x: 1, y: 0, width: 2, height: 1 }); // B C
    const merged = mergeSelection(pattern, sel);
    expect(Array.from(merged.cellPalette)).toEqual(Array.from(pattern.cellPalette));
  });

  it("a pasted selection (no originRect) never clears anything -- purely additive", () => {
    const pattern = makeGridPattern();
    const clipboard: FloatingSelection = { x: 2, y: 1, width: 1, height: 1, cells: Uint8Array.from([0]) }; // paste A's value onto F's spot, no originRect
    const merged = mergeSelection(pattern, clipboard);
    expect(Array.from(merged.cellPalette)).toEqual([0, 1, 2, 3, 4, 0]); // only F's spot changed
  });

  it("EMPTY_CELL values inside the selection overwrite the destination just like any real color", () => {
    const pattern = makeGridPattern();
    const sel: FloatingSelection = { x: 2, y: 0, width: 1, height: 1, cells: Uint8Array.from([EMPTY_CELL]) };
    const merged = mergeSelection(pattern, sel);
    expect(Array.from(merged.cellPalette)).toEqual([0, 1, EMPTY_CELL, 3, 4, 5]);
  });

  it("recomputes stitch counts after a merge", () => {
    const pattern = makeGridPattern();
    const sel = liftSelection(pattern, { x: 0, y: 0, width: 1, height: 1 });
    const moved = moveSelection(sel, 2, 1);
    const merged = mergeSelection(pattern, moved);
    expect(merged.palette[0].count).toBe(1); // A's color now only at F's old spot
    expect(merged.palette[5].count).toBe(0); // F's color is gone entirely
  });
});
