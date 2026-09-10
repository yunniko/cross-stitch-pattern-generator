/**
 * Pure page-layout math for the "Export as A4 pages" feature -- no canvas,
 * no DOM, no rendering. Deliberately isolated (Owner's own spec, requirement
 * 13) so the splitting logic can be unit-tested without a browser and never
 * gets tangled with the canvas/UI code that actually draws each page.
 */

const MM_PER_INCH = 25.4;
export const PRINT_DPI = 300;

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

// Owner's spec gave ranges, not exact values: margins "~10-15mm", cell size
// "~2.5-3mm" printed. Picked the midpoint of each range as a sane default --
// both are exposed as options so a caller can move within the requested
// range without touching this module.
export const DEFAULT_MARGIN_MM = 12;
export const DEFAULT_CELL_SIZE_MM = 2.75;

export type PageOrientation = "portrait" | "landscape";
export type OverlapCells = 0 | 5 | 10;

export function mmToPx(mm: number, dpi: number = PRINT_DPI): number {
  return Math.round((mm * dpi) / MM_PER_INCH);
}

export function a4PageSizePx(orientation: PageOrientation, dpi: number = PRINT_DPI): { width: number; height: number } {
  const width = mmToPx(A4_WIDTH_MM, dpi);
  const height = mmToPx(A4_HEIGHT_MM, dpi);
  return orientation === "portrait" ? { width, height } : { width: height, height: width };
}

/**
 * Cells per page round down to the nearest multiple of 10 when at least 10
 * fit (Owner's own example: 73 cells physically fit -> use 70) -- keeps
 * page boundaries landing on the same 10-stitch gridlines the chart already
 * draws heavier. Below 10, rounding down would leave zero usable cells, so
 * the raw count is kept instead.
 */
function roundDownToTen(n: number): number {
  return n < 10 ? n : Math.floor(n / 10) * 10;
}

export interface PageRange {
  row: number;
  column: number;
  /** Stitch range covered by this page, in the pattern's own global coordinates. End is exclusive. */
  startX: number;
  endX: number;
  startY: number;
  endY: number;
}

export interface A4Layout {
  orientation: PageOrientation;
  rows: number;
  columns: number;
  /** Row-major: index = row * columns + column. */
  pages: PageRange[];
  pageWidthPx: number;
  pageHeightPx: number;
  marginPx: number;
  cellSizePx: number;
  overlapCells: OverlapCells;
  /** Cells that fit across/down one page's printable area, before clipping to the pattern's own size. */
  cellsPerPageX: number;
  cellsPerPageY: number;
}

export interface A4LayoutOptions {
  cellSizeMm?: number;
  marginMm?: number;
  overlapCells?: OverlapCells;
  dpi?: number;
  /** Forces a specific orientation instead of auto-selecting whichever needs fewer total pages. */
  orientation?: PageOrientation;
}

/**
 * Splits a `patternWidth`x`patternHeight` stitch pattern into a grid of A4
 * page fragments. Each page's stitch range is computed independently of
 * rendering (requirement 12/13) -- this function does no drawing and
 * allocates no canvas.
 */
function computeAxisPages(totalStitches: number, cellsPerPage: number, overlapCells: number): Array<{ start: number; end: number }> {
  if (totalStitches <= cellsPerPage) {
    return [{ start: 0, end: totalStitches }];
  }

  const step = cellsPerPage - overlapCells;
  const pages: Array<{ start: number; end: number }> = [];
  let start = 0;
  for (;;) {
    const end = Math.min(start + cellsPerPage, totalStitches);
    pages.push({ start, end });
    if (end >= totalStitches) break;
    start += step;
  }
  return pages;
}

function cellsPerPageFor(printableAreaPx: number, cellSizePx: number): number {
  return roundDownToTen(Math.floor(printableAreaPx / cellSizePx));
}

function layoutForOrientation(
  patternWidth: number,
  patternHeight: number,
  orientation: PageOrientation,
  cellSizePx: number,
  marginPx: number,
  overlapCells: OverlapCells,
  dpi: number
): A4Layout {
  const { width: pageWidthPx, height: pageHeightPx } = a4PageSizePx(orientation, dpi);
  const printableWidthPx = pageWidthPx - 2 * marginPx;
  const printableHeightPx = pageHeightPx - 2 * marginPx;

  const cellsPerPageX = cellsPerPageFor(printableWidthPx, cellSizePx);
  const cellsPerPageY = cellsPerPageFor(printableHeightPx, cellSizePx);

  const xPages = computeAxisPages(patternWidth, cellsPerPageX, overlapCells);
  const yPages = computeAxisPages(patternHeight, cellsPerPageY, overlapCells);

  const pages: PageRange[] = [];
  yPages.forEach((yRange, row) => {
    xPages.forEach((xRange, column) => {
      pages.push({
        row,
        column,
        startX: xRange.start,
        endX: xRange.end,
        startY: yRange.start,
        endY: yRange.end,
      });
    });
  });

  return {
    orientation,
    rows: yPages.length,
    columns: xPages.length,
    pages,
    pageWidthPx,
    pageHeightPx,
    marginPx,
    cellSizePx,
    overlapCells,
    cellsPerPageX,
    cellsPerPageY,
  };
}

/**
 * Auto-selects whichever orientation needs fewer total pages for this
 * pattern (Owner's spec: "can automatically choose the orientation that
 * fits more cells per page"). Ties keep portrait, an arbitrary but
 * consistent default.
 */
export function calculateA4Layout(patternWidth: number, patternHeight: number, options: A4LayoutOptions = {}): A4Layout {
  const dpi = options.dpi ?? PRINT_DPI;
  const cellSizePx = mmToPx(options.cellSizeMm ?? DEFAULT_CELL_SIZE_MM, dpi);
  const marginPx = mmToPx(options.marginMm ?? DEFAULT_MARGIN_MM, dpi);
  const overlapCells = options.overlapCells ?? 5;

  if (options.orientation) {
    return layoutForOrientation(patternWidth, patternHeight, options.orientation, cellSizePx, marginPx, overlapCells, dpi);
  }

  const portrait = layoutForOrientation(patternWidth, patternHeight, "portrait", cellSizePx, marginPx, overlapCells, dpi);
  const landscape = layoutForOrientation(patternWidth, patternHeight, "landscape", cellSizePx, marginPx, overlapCells, dpi);

  const portraitPages = portrait.rows * portrait.columns;
  const landscapePages = landscape.rows * landscape.columns;

  return landscapePages < portraitPages ? landscape : portrait;
}
