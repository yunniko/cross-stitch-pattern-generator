import { describe, expect, it } from "vitest";
import { findChartLayout } from "@/lib/render";
import { MAX_COLORS, type PaletteColor, type StitchPattern } from "@/lib/types";

// Only width/height/isLandscape/palette.length matter to findChartLayout and
// the legendCanvasExtent it calls -- cellPalette itself is never read.
function makePattern(width: number, height: number, colorCount: number): StitchPattern {
  const palette: PaletteColor[] = Array.from({ length: colorCount }, (_, i) => ({
    index: i,
    rgb: [0, 0, 0],
    symbol: String(i),
    name: `Color ${i}`,
    count: 0,
  }));
  return { width, height, cellPalette: new Uint8Array(0), palette, isLandscape: width >= height };
}

const TYPICAL_HEADER_WIDTH_PX = 300;

describe("findChartLayout", () => {
  it("uses the requested cell size for an ordinary small pattern", () => {
    const layout = findChartLayout(makePattern(50, 31, 16), 24, TYPICAL_HEADER_WIDTH_PX);
    expect(layout).not.toBeNull();
    expect(layout!.cellSize).toBe(24);
  });

  it("widens the canvas for the header when the chart itself would be narrower (code-review 2026-09-09, finding 5)", () => {
    // A 10x6 chart at cellSize 24 is far narrower than a realistic header string.
    const layout = findChartLayout(makePattern(10, 6, 2), 24, 340);
    expect(layout).not.toBeNull();
    expect(layout!.canvasWidth).toBeGreaterThanOrEqual(340);
  });

  it("shrinks the cell size for the app's own largest supported case (1000x1000, MAX_COLORS colors) rather than exceeding the area/dimension budget", () => {
    const layout = findChartLayout(makePattern(1000, 1000, MAX_COLORS), 24, TYPICAL_HEADER_WIDTH_PX);
    expect(layout).not.toBeNull();
    expect(layout!.cellSize).toBeLessThan(24);
    expect(layout!.canvasWidth).toBeLessThanOrEqual(8000);
    expect(layout!.canvasHeight).toBeLessThanOrEqual(8000);
    expect(layout!.canvasWidth * layout!.canvasHeight).toBeLessThanOrEqual(40_000_000);
  });

  it("still keeps symbols legible (cellSize >= 6) at the app's own largest supported case", () => {
    // The old bug: no total-area budget meant this case could request a
    // ~564 MiB canvas with no check at all (code-review 2026-09-09, finding 4).
    // The fix should still leave the largest *supported* pattern usable, not
    // just safe -- this is the case that got harder to satisfy once an area
    // budget was added on top of the pre-existing per-dimension one.
    const layout = findChartLayout(makePattern(1000, 1000, MAX_COLORS), 24, TYPICAL_HEADER_WIDTH_PX);
    expect(layout).not.toBeNull();
    expect(layout!.cellSize).toBeGreaterThanOrEqual(6);
  });

  it("falls back to the minimum cell size, not null, when the requested size is already below it", () => {
    // A real regression caught live: the on-screen preview requests a tiny
    // cellSize (2px) to keep large patterns' thumbnails compact. A request
    // below MIN_CHART_CELL_SIZE_PX must still succeed at the floor, matching
    // the old effectiveCellSize's own Math.max(4, ...) clamp -- not be
    // treated as an already-empty search range that fails immediately.
    const layout = findChartLayout(makePattern(1000, 1000, MAX_COLORS), 2, TYPICAL_HEADER_WIDTH_PX);
    expect(layout).not.toBeNull();
    expect(layout!.cellSize).toBeGreaterThanOrEqual(4);
  });

  it("returns null when even the minimum cell size can't fit the budget", () => {
    // A pattern far past anything the app's own UI would ever generate --
    // this is the case that should now fail clearly instead of attempting a
    // huge allocation.
    const layout = findChartLayout(makePattern(50000, 50000, MAX_COLORS), 24, TYPICAL_HEADER_WIDTH_PX);
    expect(layout).toBeNull();
  });

  it("never exceeds the dimension or area budget for any cell size it returns", () => {
    for (const [w, h, colors] of [
      [50, 50, 4],
      [200, 100, 32],
      [1000, 500, MAX_COLORS],
      [500, 1000, 2],
    ] as const) {
      const layout = findChartLayout(makePattern(w, h, colors), 24, TYPICAL_HEADER_WIDTH_PX);
      expect(layout).not.toBeNull();
      expect(layout!.canvasWidth).toBeLessThanOrEqual(8000);
      expect(layout!.canvasHeight).toBeLessThanOrEqual(8000);
      expect(layout!.canvasWidth * layout!.canvasHeight).toBeLessThanOrEqual(40_000_000);
    }
  });
});
