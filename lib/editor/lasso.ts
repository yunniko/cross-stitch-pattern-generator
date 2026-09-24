import type { CellRect } from "../types";
import { lineCells, type CellPoint } from "./shape-raster";

/**
 * The cells a freehand path encloses (G-072).
 *
 * The path arrives as the cells the pointer passed over, in order. Each one is treated as its own centre, so the
 * polygon runs through cell middles and a row's scanline at `y + 0.5` passes exactly through them.
 *
 * Filled by the **even-odd** rule, which is what a lasso wants: crossing your own path carves a hole rather than
 * silently merging, so a figure-of-eight selects two lobes and not their union.
 *
 * The drawn path itself is always included, even where it encloses nothing. A lasso scribbled back and forth selects
 * the stitches it was drawn over rather than nothing at all, which is the behaviour that matches what the user saw
 * under the pointer.
 */

export interface LassoRegion {
  /** The bounding box of the selected cells, clamped to the chart. */
  rect: CellRect;
  /** One byte per cell of `rect`, 1 for selected — the shape `FloatingSelection.mask` takes. */
  mask: Uint8Array;
}

/**
 * Turns a freehand path into the region it selects, or `null` if it selects nothing — a path off the chart entirely,
 * or an empty one.
 */
export function lassoRegion(path: readonly CellPoint[], chartWidth: number, chartHeight: number): LassoRegion | null {
  if (path.length === 0 || chartWidth <= 0 || chartHeight <= 0) return null;

  // Work over the whole chart, then crop to what was actually selected: the polygon can enclose cells the path
  // never touched, so the path's own bounding box is not the answer.
  const hit = new Uint8Array(chartWidth * chartHeight);
  fillEnclosed(path, hit, chartWidth, chartHeight);
  traceOutline(path, hit, chartWidth, chartHeight);

  return cropToSelected(hit, chartWidth, chartHeight);
}

/** Even-odd scanline fill: for each row, where the closed polygon crosses that row's centre line. */
function fillEnclosed(path: readonly CellPoint[], hit: Uint8Array, width: number, height: number): void {
  if (path.length < 3) return;
  const crossings: number[] = [];
  for (let y = 0; y < height; y++) {
    const scan = y + 0.5;
    crossings.length = 0;
    for (let i = 0; i < path.length; i++) {
      const a = path[i];
      const b = path[(i + 1) % path.length]; // the closing edge is just the last pair
      const ay = a.y + 0.5;
      const by = b.y + 0.5;
      // Half-open in y, so a vertex exactly on the scanline counts once rather than twice or never.
      if (ay <= scan ? by <= scan : by > scan) continue;
      const t = (scan - ay) / (by - ay);
      crossings.push(a.x + 0.5 + t * (b.x - a.x));
    }
    if (crossings.length < 2) continue;
    crossings.sort((p, q) => p - q);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const from = Math.max(0, Math.ceil(crossings[i] - 0.5));
      const to = Math.min(width - 1, Math.floor(crossings[i + 1] - 0.5));
      for (let x = from; x <= to; x++) hit[y * width + x] = 1;
    }
  }
}

/** The path as drawn, including the segment that closes it, so the outline is part of the selection. */
function traceOutline(path: readonly CellPoint[], hit: Uint8Array, width: number, height: number): void {
  const mark = (p: CellPoint) => {
    if (p.x >= 0 && p.x < width && p.y >= 0 && p.y < height) hit[p.y * width + p.x] = 1;
  };
  if (path.length === 1) {
    mark(path[0]);
    return;
  }
  for (let i = 0; i < path.length; i++) {
    const a = path[i];
    const b = path[(i + 1) % path.length];
    if (a.x === b.x && a.y === b.y) {
      mark(a);
      continue;
    }
    for (const cell of lineCells(a, b)) mark(cell);
  }
}

/** Trims the chart-sized hit map down to the box that actually holds something. */
function cropToSelected(hit: Uint8Array, width: number, height: number): LassoRegion | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!hit[y * width + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;

  const rect: CellRect = { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
  const mask = new Uint8Array(rect.width * rect.height);
  for (let ly = 0; ly < rect.height; ly++) {
    for (let lx = 0; lx < rect.width; lx++) {
      mask[ly * rect.width + lx] = hit[(rect.y + ly) * width + rect.x + lx];
    }
  }
  return { rect, mask };
}

/** Whether a cell is inside a selection's shape — its mask if it has one, otherwise its whole box. */
export function maskedCell(mask: Uint8Array | undefined, width: number, lx: number, ly: number): boolean {
  return !mask || mask[ly * width + lx] === 1;
}
