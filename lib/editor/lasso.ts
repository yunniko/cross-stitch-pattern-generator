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
export interface LassoOptions {
  /** Round the drawn path before using it (G-072 M4). On by default; off is the path exactly as dragged. */
  smooth?: boolean;
}

export function lassoRegion(
  path: readonly CellPoint[],
  chartWidth: number,
  chartHeight: number,
  options: LassoOptions = {}
): LassoRegion | null {
  if (path.length === 0 || chartWidth <= 0 || chartHeight <= 0) return null;
  const shape = options.smooth === false ? path : smoothClosedPath(path);

  // Work over the whole chart, then crop to what was actually selected: the polygon can enclose cells the path
  // never touched, so the path's own bounding box is not the answer.
  const hit = new Uint8Array(chartWidth * chartHeight);
  fillEnclosed(shape, hit, chartWidth, chartHeight);
  traceOutline(shape, hit, chartWidth, chartHeight);

  return cropToSelected(hit, chartWidth, chartHeight);
}

/** How many corner-cutting passes a drawn path gets. Two is enough to lose the stair-stepping of a hand drag. */
const SMOOTHING_PASSES = 2;

/** Below this a path is deliberate input, not a freehand drag, and is left exactly where it was put. */
const SMOOTHING_MIN_POINTS = 8;

/**
 * Chaikin's corner cutting, on a closed path (G-072 M4).
 *
 * Each pass replaces every point with two points a quarter and three quarters along its edges, which rounds
 * corners without overshooting them — a curve fitted through the points (Catmull-Rom, say) can bulge outside the
 * shape that was drawn, and selecting stitches the user never enclosed is worse than a slightly blunt corner.
 *
 * The closing edge is part of the cycle, so the gap from finish back to start is rounded like any other corner
 * rather than left as a chord.
 *
 * Points stay fractional: the scanline fill works in real coordinates, and only the outline trace rounds.
 */
export function smoothClosedPath(path: readonly CellPoint[]): CellPoint[] {
  if (path.length < SMOOTHING_MIN_POINTS) return [...path];
  let points: CellPoint[] = [...path];
  for (let pass = 0; pass < SMOOTHING_PASSES; pass++) {
    const next: CellPoint[] = new Array(points.length * 2);
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      next[i * 2] = { x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 };
      next[i * 2 + 1] = { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 };
    }
    points = next;
  }
  return points;
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
    mark({ x: Math.round(path[0].x), y: Math.round(path[0].y) });
    return;
  }
  // A smoothed path is fractional; the cells it passes through are what can be marked.
  const cellOf = (p: CellPoint) => ({ x: Math.round(p.x), y: Math.round(p.y) });
  for (let i = 0; i < path.length; i++) {
    const a = cellOf(path[i]);
    const b = cellOf(path[(i + 1) % path.length]);
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
