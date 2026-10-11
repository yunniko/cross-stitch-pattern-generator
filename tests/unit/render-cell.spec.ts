import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCanvas } from "@/lib/editor/canvas-backend";
import { installNodeCanvas, uninstallNodeCanvas } from "./helpers/node-canvas";
import { CLEAR_EMPTY, drawCell, drawChart, drawChartOnScreen, GRID_LINE_COLOR } from "@/lib/editor/chart-render";
import { EMPTY_CELL, type PaletteColor, type StitchPattern } from "@/lib/types";
import { makeRecordingContext } from "./helpers/recording-context";

function makePattern(): StitchPattern {
  const palette: PaletteColor[] = [
    { index: 0, rgb: [255, 0, 0], symbol: "A", name: "Red", count: 3 },
    { index: 1, rgb: [0, 0, 40], symbol: "B", name: "Navy", count: 1 },
  ];
  return { width: 2, height: 2, cellPalette: Uint8Array.from([0, 0, 0, 1]), palette, isLandscape: true };
}

/** What a draw filled other than the grid. */
const stitchRects = (ctx: ReturnType<typeof makeRecordingContext>) => ctx.rects.filter((r) => r.fillStyle !== GRID_LINE_COLOR);

beforeAll(installNodeCanvas);
afterAll(uninstallNodeCanvas);

/** G-031 M2 (review B7): a single-cell redraw must leave the canvas exactly as a full `drawChart` would have at that cell. */
describe("drawCell", () => {
  /** The grid bands a draw filled, as [vertical, position, thickness]: the shape a stroke of that weight would cover. */
  const gridBands = (ctx: ReturnType<typeof makeRecordingContext>) =>
    ctx.rects.filter((r) => r.fillStyle === GRID_LINE_COLOR).map((r) => (r.h > r.w ? [true, r.x, r.w] : [false, r.y, r.h]));

  it("fills and labels exactly the one cell, at its own position, and re-draws the four gridlines around it", () => {
    const ctx = makeRecordingContext();
    drawCell(ctx, makePattern(), "color", 20, 1, 0, 1);

    expect(stitchRects(ctx)).toEqual([{ x: 20, y: 0, w: 20, h: 20, fillStyle: "rgb(0, 0, 40)" }]);
    expect(ctx.texts).toEqual([{ text: "B", x: 30, y: 11, fillStyle: "#ffffff" }]); // dark fill -> white symbol
    const grid = ctx.rects.filter((r) => r.fillStyle === GRID_LINE_COLOR);
    // Vertical bands at x=20 and x=40 spanning the cell's height; horizontal ones at y=0 and y=20 spanning its width.
    expect(grid.length).toBeGreaterThanOrEqual(4);
    for (const r of grid) {
      if (r.h > r.w) expect([r.y, r.h]).toEqual([0, 20]);
      else expect([r.x, r.w]).toEqual([20, 20]);
    }
    // Each band is its opaque core plus, for an odd width, a half-pixel strip either side: group them by grid line.
    const lines = new Set(
      grid.map((r) => (r.h > r.w ? `x${Math.round((r.x + r.w / 2) / 20) * 20}` : `y${Math.round((r.y + r.h / 2) / 20) * 20}`))
    );
    expect([...lines].sort()).toEqual(["x20", "x40", "y0", "y20"]);
  });

  it("uses the same gridline weights as the full chart for the cell's global row/column (every 5th/10th heavier)", () => {
    const big: StitchPattern = { ...makePattern(), width: 12, height: 12, cellPalette: new Uint8Array(144) };
    const full = makeRecordingContext();
    drawChart(full, big, "color", 24);
    const fullBands = new Set(gridBands(full).map((b) => b.join()));

    const one = makeRecordingContext();
    drawCell(one, big, "color", 24, 9, 4, 0); // right edge is column 10 (major), bottom edge is row 5 (medium)
    const bands = gridBands(one);
    for (const b of bands) expect(fullBands.has(b.join())).toBe(true);
    // Column 10's band is wider than column 9's.
    // Summed over a line's core and edge strips, its covered width.
    const thickness = (vertical: boolean, line: number) =>
      bands
        .filter(([v, at, w]) => v === vertical && Math.round(((at as number) + (w as number) / 2) / 24) === line)
        .reduce((t, [, , w]) => t + (w as number), 0);
    expect(thickness(true, 10)).toBeGreaterThan(thickness(true, 9));
  });

  it("draws the empty-cell sentinel as the canvas color with no symbol", () => {
    const ctx = makeRecordingContext();
    drawCell(ctx, makePattern(), "color", 20, 0, 0, EMPTY_CELL, "#abcdef");
    expect(stitchRects(ctx)).toEqual([{ x: 0, y: 0, w: 20, h: 20, fillStyle: "#abcdef" }]);
    expect(ctx.texts).toEqual([]);
  });

  it("skips the symbol below the legibility floor, like drawChart", () => {
    const ctx = makeRecordingContext();
    drawCell(ctx, makePattern(), "bw", 4, 0, 0, 0);
    expect(stitchRects(ctx)).toHaveLength(1);
    expect(ctx.texts).toEqual([]);
  });
});

/** G-110 (D315): with Symbols off the screen draws the same fills and grid, and no symbol, at any cell size. */
describe("the Symbols switch", () => {
  it("leaves out every symbol and nothing else, for the whole chart and for a single stitch", () => {
    for (const mode of ["color", "bw"] as const) {
      const on = makeRecordingContext();
      const off = makeRecordingContext();
      drawChart(on, makePattern(), mode, 24);
      drawChart(off, makePattern(), mode, 24, undefined, "#ffffff", false);
      expect(on.texts).toHaveLength(4);
      expect(off.texts).toEqual([]);
      expect(off.rects).toEqual(on.rects);

      const cell = makeRecordingContext();
      drawCell(cell, makePattern(), mode, 24, 1, 1, 1, "#ffffff", undefined, false);
      expect(stitchRects(cell)).toHaveLength(1);
      expect(cell.texts).toEqual([]);
    }
  });
});

/** D316: over the photo an empty stitch is left unpainted, on the fast path and the exact one alike. */
describe("an empty stitch drawn over something", () => {
  it("leaves its cell clear while a stitch beside it is painted", () => {
    const pattern: StitchPattern = { ...makePattern(), cellPalette: Uint8Array.from([0, EMPTY_CELL, 0, 1]) };
    for (const symbols of [false, true]) {
      const canvas = createCanvas(2 * 24, 2 * 24);
      drawChartOnScreen(canvas.ctx as never, pattern, "color", 24, undefined, CLEAR_EMPTY, symbols);
      const alphaAt = (x: number, y: number) => canvas.ctx.getImageData(x, y, 1, 1).data[3];
      expect(alphaAt(24 + 12, 12), `empty, symbols ${symbols}`).toBe(0);
      expect(alphaAt(12, 12), `stitch, symbols ${symbols}`).toBe(255);
    }
  });
});
