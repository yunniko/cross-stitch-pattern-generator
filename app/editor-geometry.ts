import { cellAtClient } from "@/lib/editor/chart-viewport";
import type { StampEdge } from "@/lib/editor/brush-stamp";
import { smoothClosedPath } from "@/lib/editor/lasso";
import type { CellPoint } from "@/lib/editor/shape-raster";
import type { BackstitchLine, PaletteColor } from "@/lib/types";
import type { CellRect, StitchPattern } from "@/lib/types";

// The Image window's target on-screen width: cell size derives from it, so a small pattern isn't tiny and a large one fits.
const IMAGE_WINDOW_TARGET_WIDTH_PX = 720;
const IMAGE_WINDOW_MAX_CELL_SIZE = 28;
const IMAGE_WINDOW_MIN_CELL_SIZE = 4;

/** The photo underlay's opacity in Grid + photo mode, so the symbol grid stays the readable layer. */
export const PHOTO_UNDERLAY_ALPHA = 0.55;

/**
 * On-screen cell size. Zoom re-renders at a higher resolution rather than scaling pixels, so symbols appear when zoomed
 * in. There is no cap on the zoomed chart's size: since D135 only the chart frame is chart-sized, and it is layout, while
 * the canvas covers the view. An 8000 px cap from before then left a 1000-stitch chart at 8 px a stitch and a larger one
 * unzoomable (G-046 M4, D179).
 */
export function computeCellSize(pattern: StitchPattern | null, zoomLevel: number): number {
  if (!pattern) return IMAGE_WINDOW_MAX_CELL_SIZE;
  const longer = Math.max(pattern.width, pattern.height);
  const base = Math.max(
    IMAGE_WINDOW_MIN_CELL_SIZE,
    Math.min(IMAGE_WINDOW_MAX_CELL_SIZE, Math.floor(IMAGE_WINDOW_TARGET_WIDTH_PX / longer))
  );
  return Math.round(base * zoomLevel);
}

/**
 * The zoom level a press lands on, skipping any that would render the chart exactly as it is now (Owner,
 * 2026-09-23). Cell size is `round(base * zoom)`, so on a large chart, where the base is already at its 4 px floor,
 * one 1.4x step can round to the same number of pixels and the press appears to do nothing: at 25% a cell is 1 px,
 * and so is 35%. Returns the current level when nothing further is reachable, which is the caller's cue to do
 * nothing rather than move the readout away from what is on screen.
 */
export function nextZoomLevel(
  current: number,
  factor: number,
  bounds: { min: number; max: number },
  cellSizeAt: (zoom: number) => number
): number {
  const clamp = (zoom: number) => Math.max(bounds.min, Math.min(bounds.max, zoom));
  const now = cellSizeAt(current);
  let next = clamp(current * factor);
  // Bounded by the number of steps between the two ends, which is small; the guard is against a factor of 1.
  for (let step = 0; step < 64 && cellSizeAt(next) === now && next > bounds.min && next < bounds.max; step++) {
    next = clamp(next * factor);
  }
  return cellSizeAt(next) === now ? current : next;
}

export interface PointerPosition {
  clientX: number;
  clientY: number;
}

/** The chart frame's content-box origin in client coordinates: chart pixel (0, 0), inside the frame's border (D135). */
export function chartOrigin(frame: HTMLElement): { left: number; top: number } {
  const rect = frame.getBoundingClientRect();
  return { left: rect.left + frame.clientLeft, top: rect.top + frame.clientTop };
}

function cellFromEvent(e: PointerPosition, frame: HTMLElement, cellSize: number): { x: number; y: number } {
  const origin = chartOrigin(frame);
  return cellAtClient(e.clientX, e.clientY, origin.left, origin.top, cellSize);
}

/** The row-major cell index under the pointer, or null outside the grid. */
export function cellIndexFromEvent(e: PointerPosition, frame: HTMLElement, cellSize: number, width: number, height: number): number | null {
  const { x, y } = cellFromEvent(e, frame, cellSize);
  if (x < 0 || x >= width || y < 0 || y >= height) return null;
  return y * width + x;
}

/** Like `cellIndexFromEvent` but clamped to the grid, so a drag that drifts past the edge keeps tracking. */
export function clampedCellFromEvent(
  e: PointerPosition,
  frame: HTMLElement,
  cellSize: number,
  width: number,
  height: number
): { x: number; y: number } {
  const { x, y } = cellFromEvent(e, frame, cellSize);
  return { x: Math.max(0, Math.min(width - 1, x)), y: Math.max(0, Math.min(height - 1, y)) };
}

/**
 * The grid corner nearest the pointer, clamped to the chart (G-073).
 *
 * A backstitch starts and ends on a corner, never inside a cell, so the pointer is **rounded** to the nearest
 * one rather than floored to the cell it is in. Corners run `0..width` and `0..height` inclusive.
 */
export function cornerFromEvent(
  e: PointerPosition,
  frame: HTMLElement,
  cellSize: number,
  width: number,
  height: number
): { x: number; y: number } {
  const origin = chartOrigin(frame);
  const x = Math.round((e.clientX - origin.left) / cellSize);
  const y = Math.round((e.clientY - origin.top) / cellSize);
  return { x: Math.max(0, Math.min(width, x)), y: Math.max(0, Math.min(height, y)) };
}

export function rectFromCorners(x0: number, y0: number, x1: number, y1: number): CellRect {
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  return { x, y, width: Math.abs(x1 - x0) + 1, height: Math.abs(y1 - y0) + 1 };
}

export function pointInRect(x: number, y: number, rect: CellRect): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

/**
 * The outline of the stitches one press would cover, under the cursor (G-065). Drawn as a dark stroke with a light
 * one over it, so it reads on a dark thread and a light one alike -- the selection's blue dashes and symmetry's red
 * guides already mean something else, and this must not be mistaken for either.
 */
export function drawStampOutline(
  ctx: CanvasRenderingContext2D,
  edges: readonly StampEdge[],
  cell: { x: number; y: number },
  cellSize: number
) {
  if (edges.length === 0) return;
  const path = new Path2D();
  for (const { x1, y1, x2, y2 } of edges) {
    path.moveTo((cell.x + x1) * cellSize, (cell.y + y1) * cellSize);
    path.lineTo((cell.x + x2) * cellSize, (cell.y + y2) * cellSize);
  }
  ctx.save();
  ctx.lineJoin = "miter";
  ctx.strokeStyle = "rgba(0, 0, 0, 0.65)";
  ctx.lineWidth = Math.max(3, Math.round(cellSize * 0.16) + 2);
  ctx.stroke(path);
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(1, Math.round(cellSize * 0.16));
  ctx.stroke(path);
  ctx.restore();
}

/** A dashed outline of the current or in-progress selection, in a color distinct from the grid lines. */
export function drawSelectionOutline(ctx: CanvasRenderingContext2D, rect: CellRect, cellSize: number, mask?: Uint8Array) {
  if (rect.width <= 0 || rect.height <= 0) return;
  ctx.save();
  selectionStroke(ctx, cellSize);
  if (mask) traceMaskBoundary(ctx, rect, cellSize, mask);
  else ctx.strokeRect(rect.x * cellSize, rect.y * cellSize, rect.width * cellSize, rect.height * cellSize);
  ctx.restore();
}

function selectionStroke(ctx: CanvasRenderingContext2D, cellSize: number) {
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = Math.max(2, Math.round(cellSize * 0.12));
  ctx.setLineDash([Math.max(4, cellSize * 0.5), Math.max(4, cellSize * 0.5)]);
}

/**
 * The edges of a shaped selection (G-072): every side of a selected cell whose neighbour is not selected.
 *
 * Drawn from the cell grid rather than from the path the user drew, so the outline always matches the
 * stitches that are actually in the piece -- including any hole the lasso carved.
 */
function traceMaskBoundary(ctx: CanvasRenderingContext2D, rect: CellRect, cellSize: number, mask: Uint8Array) {
  const inside = (lx: number, ly: number) => lx >= 0 && ly >= 0 && lx < rect.width && ly < rect.height && mask[ly * rect.width + lx] === 1;
  ctx.beginPath();
  for (let ly = 0; ly < rect.height; ly++) {
    for (let lx = 0; lx < rect.width; lx++) {
      if (!inside(lx, ly)) continue;
      const x0 = (rect.x + lx) * cellSize;
      const y0 = (rect.y + ly) * cellSize;
      const x1 = x0 + cellSize;
      const y1 = y0 + cellSize;
      if (!inside(lx, ly - 1)) {
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y0);
      }
      if (!inside(lx, ly + 1)) {
        ctx.moveTo(x0, y1);
        ctx.lineTo(x1, y1);
      }
      if (!inside(lx - 1, ly)) {
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0, y1);
      }
      if (!inside(lx + 1, ly)) {
        ctx.moveTo(x1, y0);
        ctx.lineTo(x1, y1);
      }
    }
  }
  ctx.stroke();
}

/**
 * The lasso path as it is being drawn (G-072): through cell centres, closed, so you can see what it will take.
 *
 * `stroke` is the colour a Lasso fill is about to paint. Without it the path is drawn in the selection's own
 * dashed blue, which everywhere else in the editor means "this is selected" — the wrong thing to say about a
 * tool that is going to paint.
 */
export function drawLassoPath(ctx: CanvasRenderingContext2D, path: readonly CellPoint[], cellSize: number, stroke?: string) {
  if (path.length === 0) return;
  // Drawn smoothed, because that is the shape the release will use: a preview of the raw drag would promise
  // corners the result does not keep. Smoothing a few hundred points costs well under a millisecond (G-072 M4).
  path = smoothClosedPath(path);
  ctx.save();
  selectionStroke(ctx, cellSize);
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.setLineDash([]);
  }
  ctx.beginPath();
  ctx.moveTo((path[0].x + 0.5) * cellSize, (path[0].y + 0.5) * cellSize);
  for (let i = 1; i < path.length; i++) ctx.lineTo((path[i].x + 0.5) * cellSize, (path[i].y + 0.5) * cellSize);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/** A backstitch is a fifth of a cell wide (Owner, 2026-09-25), never thinner than a pixel on screen. */
export const BACKSTITCH_WIDTH_RATIO = 1 / 5;

/**
 * Draws backstitch lines over the chart (G-073).
 *
 * Round caps and joins, because a chain of segments meeting at a corner should read as one continuous line
 * rather than as separate strokes with a notch between them.
 */
export function drawBackstitch(
  ctx: CanvasRenderingContext2D,
  lines: readonly BackstitchLine[],
  palette: readonly PaletteColor[],
  cellSize: number,
  highlight?: (line: BackstitchLine) => boolean
) {
  if (lines.length === 0) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const base = Math.max(1, cellSize * BACKSTITCH_WIDTH_RATIO);
  for (const line of lines) {
    const color = palette[line.paletteIndex];
    if (!color) continue;
    // A selected line is drawn thicker, which is how the Select tool shows what it has hold of (G-073 M3).
    ctx.lineWidth = highlight?.(line) ? base * 1.8 : base;
    ctx.strokeStyle = `rgb(${color.rgb[0]} ${color.rgb[1]} ${color.rgb[2]})`;
    ctx.beginPath();
    ctx.moveTo(line.x1 * cellSize, line.y1 * cellSize);
    ctx.lineTo(line.x2 * cellSize, line.y2 * cellSize);
    ctx.stroke();
  }
  ctx.restore();
}

export function releaseCapture(element: HTMLElement | null, pointerId: number) {
  if (element?.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
}
