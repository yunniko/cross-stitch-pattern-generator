import { describe, expect, it } from "vitest";
import { calculateA4Layout, mmToPx, a4PageSizePx, DEFAULT_CELL_SIZE_MM, DEFAULT_MARGIN_MM } from "@/lib/a4-layout";

// dpi=254 makes 1mm exactly 10px -- lets these tests hit clean round numbers
// instead of fighting floating-point rounding from a realistic 300 DPI.
const TEST_DPI = 254;

describe("mmToPx / a4PageSizePx", () => {
  it("converts millimeters to pixels at the given DPI", () => {
    expect(mmToPx(25.4, 300)).toBe(300);
    expect(mmToPx(1, TEST_DPI)).toBe(10);
  });

  it("swaps width/height between portrait and landscape", () => {
    const portrait = a4PageSizePx("portrait");
    const landscape = a4PageSizePx("landscape");
    expect(landscape).toEqual({ width: portrait.height, height: portrait.width });
  });

  it("produces the standard ~2480x3508 portrait page at 300 DPI", () => {
    expect(a4PageSizePx("portrait", 300)).toEqual({ width: 2480, height: 3508 });
  });
});

describe("calculateA4Layout", () => {
  // cellSizeMm=1 -> cellSizePx=10 at TEST_DPI; marginMm=67 -> marginPx=670.
  // Portrait page is 2100x2970px at this DPI; after also reserving the
  // caption/number-gutter chrome (see CAPTION_HEIGHT_MM/NUMBER_GUTTER_MM),
  // the printable grid area works out to exactly 70 cells across, 149 cells
  // down (rounds to 140). Orientation is pinned to portrait throughout so
  // these tests isolate one axis's splitting behavior instead of also
  // exercising auto-orientation (covered separately below).
  const columnLayoutOptions = { cellSizeMm: 1, marginMm: 67, dpi: TEST_DPI, orientation: "portrait" } as const;

  it("matches the Owner's own worked example with no overlap: 0-70, 70-140, 140-180", () => {
    const layout = calculateA4Layout(180, 10, { ...columnLayoutOptions, overlapCells: 0 });
    expect(layout.orientation).toBe("portrait");
    expect(layout.rows).toBe(1);
    expect(layout.columns).toBe(3);
    const ranges = layout.pages.map((p) => [p.startX, p.endX]);
    expect(ranges).toEqual([
      [0, 70],
      [70, 140],
      [140, 180],
    ]);
  });

  it("matches the Owner's own worked example with overlap 5: 0-70, 65-135", () => {
    const layout = calculateA4Layout(135, 10, { ...columnLayoutOptions, overlapCells: 5 });
    expect(layout.columns).toBe(2);
    const ranges = layout.pages.map((p) => [p.startX, p.endX]);
    expect(ranges).toEqual([
      [0, 70],
      [65, 135],
    ]);
  });

  it("rounds cells-per-page down to the nearest 10 (73 fit -> use 70)", () => {
    // Portrait page is 2100px wide at TEST_DPI; marginMm=65.5 -> marginPx=655
    // each side, minus the 60px number-gutter reserved on the left, leaves
    // 730px printable -> floor(730/10)=73 cells, which rounds down to 70.
    const layout = calculateA4Layout(1000, 10, { cellSizeMm: 1, marginMm: 65.5, dpi: TEST_DPI, orientation: "portrait", overlapCells: 0 });
    expect(layout.cellsPerPageX).toBe(70);
  });

  it("a pattern smaller than one page produces exactly one page covering the whole pattern", () => {
    const layout = calculateA4Layout(20, 15, { ...columnLayoutOptions, overlapCells: 5 });
    expect(layout.rows).toBe(1);
    expect(layout.columns).toBe(1);
    expect(layout.pages).toEqual([{ row: 0, column: 0, startX: 0, endX: 20, startY: 0, endY: 15 }]);
  });

  it("a pattern exactly matching one page's capacity produces exactly one page", () => {
    const layout = calculateA4Layout(70, 10, { ...columnLayoutOptions, overlapCells: 5 });
    expect(layout.columns).toBe(1);
    expect(layout.pages[0]).toMatchObject({ startX: 0, endX: 70 });
  });

  it("splits into 2 pages horizontally only when width exceeds capacity but height doesn't", () => {
    const layout = calculateA4Layout(135, 10, { ...columnLayoutOptions, overlapCells: 5 });
    expect(layout.columns).toBe(2);
    expect(layout.rows).toBe(1);
  });

  it("splits into 2 pages vertically only when height exceeds capacity but width doesn't", () => {
    // cellsPerPageY at these options is 140 (see columnLayoutOptions comment).
    const layout = calculateA4Layout(10, 200, { ...columnLayoutOptions, overlapCells: 0 });
    expect(layout.rows).toBe(2);
    expect(layout.columns).toBe(1);
    const ranges = layout.pages.map((p) => [p.startY, p.endY]);
    expect(ranges).toEqual([
      [0, 140],
      [140, 200],
    ]);
  });

  it("splits into multiple pages on both axes at once, row-major ordered", () => {
    const layout = calculateA4Layout(135, 200, { ...columnLayoutOptions, overlapCells: 0 });
    expect(layout.columns).toBe(2);
    expect(layout.rows).toBe(2);
    expect(layout.pages).toHaveLength(4);
    // Row-major: index 0 is (row0,col0), index 1 is (row0,col1), etc.
    expect(layout.pages.map((p) => [p.row, p.column])).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]);
  });

  it("handles pattern dimensions that aren't a multiple of 10", () => {
    const layout = calculateA4Layout(143, 10, { ...columnLayoutOptions, overlapCells: 0 });
    const ranges = layout.pages.map((p) => [p.startX, p.endX]);
    expect(ranges).toEqual([
      [0, 70],
      [70, 140],
      [140, 143],
    ]);
  });

  it("overlap=0 leaves no gap or overlap between consecutive pages", () => {
    const layout = calculateA4Layout(180, 10, { ...columnLayoutOptions, overlapCells: 0 });
    for (let i = 1; i < layout.pages.length; i++) {
      expect(layout.pages[i].startX).toBe(layout.pages[i - 1].endX);
    }
  });

  it("overlap=5 makes each page (but the first) start 5 cells before the previous page ended", () => {
    const layout = calculateA4Layout(200, 10, { ...columnLayoutOptions, overlapCells: 5 });
    for (let i = 1; i < layout.pages.length; i++) {
      expect(layout.pages[i].startX).toBe(layout.pages[i - 1].endX - 5);
    }
  });

  it("handles a very large pattern (1000x1000, the app's own max) without excessive pages", () => {
    const layout = calculateA4Layout(1000, 1000);
    expect(layout.rows * layout.columns).toBeGreaterThan(0);
    expect(layout.pages[layout.pages.length - 1].endX).toBe(1000);
    expect(layout.pages[layout.pages.length - 1].endY).toBe(1000);
  });

  it("auto-selects landscape when the pattern is much wider than tall", () => {
    // With default options, portrait fits 60 cols x 100 rows per page;
    // landscape fits 100 cols x 60 rows -- a very wide, short pattern needs
    // fewer total pages in landscape.
    const layout = calculateA4Layout(1000, 50);
    expect(layout.orientation).toBe("landscape");
  });

  it("auto-selects portrait when the pattern is much taller than wide", () => {
    const layout = calculateA4Layout(50, 1000);
    expect(layout.orientation).toBe("portrait");
  });

  it("uses the documented default margin/cell-size constants when none are given", () => {
    const layout = calculateA4Layout(10, 10);
    expect(layout.cellSizePx).toBe(mmToPx(DEFAULT_CELL_SIZE_MM));
    expect(layout.marginPx).toBe(mmToPx(DEFAULT_MARGIN_MM));
  });

  it("reserves grid origin space beyond the margin for the caption and coordinate-number gutters", () => {
    const layout = calculateA4Layout(10, 10, { marginMm: 10 });
    expect(layout.gridOriginXPx).toBeGreaterThan(layout.marginPx);
    expect(layout.gridOriginYPx).toBeGreaterThan(layout.gridOriginXPx);
    // The grid plus its trailing margin must never exceed the physical page.
    expect(layout.gridOriginXPx + layout.cellsPerPageX * layout.cellSizePx + layout.marginPx).toBeLessThanOrEqual(layout.pageWidthPx);
    expect(layout.gridOriginYPx + layout.cellsPerPageY * layout.cellSizePx + layout.marginPx).toBeLessThanOrEqual(layout.pageHeightPx);
  });
});
