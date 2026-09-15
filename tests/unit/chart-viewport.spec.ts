import { describe, expect, it } from "vitest";
import {
  cellAtClient,
  cellRegionFor,
  devicePixelAlignment,
  guardCells,
  intersectRects,
  moveTileOffsets,
  needsRepaint,
  paintedRectFor,
  visibleChartRect,
} from "@/lib/editor/chart-viewport";

/** G-036 M3: the viewport canvas's geometry, all in chart pixels (D135). */
describe("visibleChartRect", () => {
  it("is the scroller's client area in chart pixels, clamped to the chart", () => {
    // Frame content box at client (100.5, 40), scroller client area 200..900 × 50..650, chart 2000 × 1500.
    expect(visibleChartRect(100.5, 40, { left: 200, top: 50, right: 900, bottom: 650 }, 2000, 1500)).toEqual({ x0: 99.5, y0: 10, x1: 799.5, y1: 610 });
  });

  it("clamps to the chart when it is smaller than the view and centred inside it", () => {
    expect(visibleChartRect(300, 200, { left: 0, top: 0, right: 1000, bottom: 800 }, 400, 300)).toEqual({ x0: 0, y0: 0, x1: 400, y1: 300 });
  });

  it("scrolled past the chart's start, it begins deeper in the chart", () => {
    expect(visibleChartRect(-1234.25, -56, { left: 0, top: 0, right: 700, bottom: 500 }, 8000, 6000)).toEqual({ x0: 1234.25, y0: 56, x1: 1934.25, y1: 556 });
  });
});

describe("paintedRectFor", () => {
  it("rounds fractional bounds outward to whole chart pixels and clamps to the chart", () => {
    expect(paintedRectFor({ x0: 99.5, y0: 10.2, x1: 799.5, y1: 610.7 }, 0, 0, 2000, 1500)).toEqual({ x0: 99, y0: 10, x1: 800, y1: 611 });
    expect(paintedRectFor({ x0: 99.5, y0: 10, x1: 799.5, y1: 610 }, 700, 600, 2000, 1500)).toEqual({ x0: 0, y0: 0, x1: 1500, y1: 1210 });
  });

  it("is empty when nothing is visible", () => {
    expect(paintedRectFor({ x0: 5, y0: 5, x1: 5, y1: 9 }, 100, 100, 2000, 1500)).toEqual({ x0: 0, y0: 0, x1: 0, y1: 0 });
  });

  it("gives integer bounds for every fractional input", () => {
    for (let i = 0; i < 200; i++) {
      const x0 = (i * 37.13) % 1900;
      const y0 = (i * 11.7) % 1400;
      const r = paintedRectFor({ x0, y0, x1: x0 + 91.37, y1: y0 + 63.9 }, 12.5, 7.25, 2000, 1500);
      for (const v of [r.x0, r.y0, r.x1, r.y1]) expect(Number.isInteger(v)).toBe(true);
      expect(r.x0).toBeLessThanOrEqual(x0);
      expect(r.x1).toBeGreaterThanOrEqual(Math.min(2000, x0 + 91.37));
    }
  });
});

describe("devicePixelAlignment and aligned painted rectangles", () => {
  it("finds the smallest CSS step that is a whole number of device pixels", () => {
    expect(devicePixelAlignment(1)).toBe(1);
    expect(devicePixelAlignment(2)).toBe(1);
    expect(devicePixelAlignment(1.25)).toBe(4);
    expect(devicePixelAlignment(1.5)).toBe(2);
    expect(devicePixelAlignment(1.75)).toBe(4);
    expect(devicePixelAlignment(2.625)).toBe(8);
    expect(devicePixelAlignment(1.1)).toBe(10);
    expect(devicePixelAlignment(Math.PI)).toBe(1);
  });

  it("rounds the leading edges down to the step, so the canvas starts on a device pixel", () => {
    expect(paintedRectFor({ x0: 99.5, y0: 10.2, x1: 799.5, y1: 610.7 }, 0, 0, 2000, 1500, 4)).toEqual({ x0: 96, y0: 8, x1: 800, y1: 611 });
    expect(paintedRectFor({ x0: 3, y0: 1, x1: 50, y1: 50 }, 0, 0, 2000, 1500, 4)).toEqual({ x0: 0, y0: 0, x1: 50, y1: 50 });
  });
});

describe("needsRepaint", () => {
  const painted = { x0: 0, y0: 100, x1: 1500, y1: 1300 };

  it("keeps the bitmap while the visible area plus the margin stays inside it", () => {
    expect(needsRepaint({ x0: 200, y0: 400, x1: 900, y1: 1000 }, painted, 100, 2000, 1500)).toBe(false);
  });

  it("repaints once the margin would leave the painted area", () => {
    expect(needsRepaint({ x0: 200, y0: 150, x1: 900, y1: 750 }, painted, 100, 2000, 1500)).toBe(true);
    expect(needsRepaint({ x0: 900, y0: 400, x1: 1450, y1: 1000 }, painted, 100, 2000, 1500)).toBe(true);
  });

  it("clamps the margin at the chart edges, so a bitmap reaching an edge never repaints for it", () => {
    expect(needsRepaint({ x0: 0, y0: 400, x1: 700, y1: 1000 }, painted, 100, 2000, 1500)).toBe(false);
  });

  it("always repaints an empty bitmap with something visible, and never when nothing is visible", () => {
    expect(needsRepaint({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 0, y0: 0, x1: 0, y1: 0 }, 0, 100, 100)).toBe(true);
    expect(needsRepaint({ x0: 0, y0: 0, x1: 0, y1: 10 }, { x0: 0, y0: 0, x1: 0, y1: 0 }, 0, 100, 100)).toBe(false);
  });
});

describe("guardCells and cellRegionFor", () => {
  it("adds one stitch beyond the largest overhang", () => {
    expect(guardCells(0, 8)).toBe(1);
    expect(guardCells(7, 8)).toBe(2);
    expect(guardCells(8, 8)).toBe(2);
    expect(guardCells(8.01, 8)).toBe(3);
    expect(guardCells(-3, 8)).toBe(1);
  });

  it("covers every stitch touching the bitmap plus the guard, clamped to the pattern", () => {
    // Bitmap 99..800 × 10..611 at 8 px: stitches 12..100 × 1..77, guard 2.
    expect(cellRegionFor({ x0: 99, y0: 10, x1: 800, y1: 611 }, 8, 2, 250, 187)).toEqual({ x0: 10, y0: 0, x1: 102, y1: 79 });
    expect(cellRegionFor({ x0: 0, y0: 0, x1: 2000, y1: 1496 }, 8, 3, 250, 187)).toEqual({ x0: 0, y0: 0, x1: 250, y1: 187 });
  });
});

describe("cellAtClient", () => {
  it("maps the content box, not the border, to stitches", () => {
    expect(cellAtClient(101, 41, 101, 41, 14)).toEqual({ x: 0, y: 0 });
    expect(cellAtClient(114.99, 54.99, 101, 41, 14)).toEqual({ x: 0, y: 0 });
    expect(cellAtClient(115, 55, 101, 41, 14)).toEqual({ x: 1, y: 1 });
    // The 1 px border just outside the content box is off the chart.
    expect(cellAtClient(100.5, 40.5, 101, 41, 14)).toEqual({ x: -1, y: -1 });
  });
});

describe("moveTileOffsets", () => {
  it("matches the pre-G-036 snapshot blit's wrap-around offsets, including negative and multi-wrap shifts", () => {
    expect(moveTileOffsets(3, -2, 50, 30, 10)).toEqual([
      { x: 30, y: 280 },
      { x: -470, y: 280 },
      { x: 30, y: -20 },
      { x: -470, y: -20 },
    ]);
    expect(moveTileOffsets(103, 0, 50, 30, 10)[0]).toEqual({ x: 30, y: 0 });
    expect(moveTileOffsets(-50, -60, 50, 30, 10)[0]).toEqual({ x: 0, y: 0 });
  });
});

describe("intersectRects", () => {
  it("intersects, leaving an empty rectangle when they don't overlap", () => {
    expect(intersectRects({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 5, y0: -5, x1: 20, y1: 7 })).toEqual({ x0: 5, y0: 0, x1: 10, y1: 7 });
    const none = intersectRects({ x0: 0, y0: 0, x1: 10, y1: 10 }, { x0: 12, y0: 0, x1: 20, y1: 10 });
    expect(none.x1 <= none.x0).toBe(true);
  });
});
