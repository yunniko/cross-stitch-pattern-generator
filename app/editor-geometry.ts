import { cellAtClient } from "@/lib/editor/chart-viewport";
import type { StampEdge } from "@/lib/editor/brush-stamp";
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
export function drawSelectionOutline(ctx: CanvasRenderingContext2D, rect: CellRect, cellSize: number) {
  if (rect.width <= 0 || rect.height <= 0) return;
  ctx.save();
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = Math.max(2, Math.round(cellSize * 0.12));
  ctx.setLineDash([Math.max(4, cellSize * 0.5), Math.max(4, cellSize * 0.5)]);
  ctx.strokeRect(rect.x * cellSize, rect.y * cellSize, rect.width * cellSize, rect.height * cellSize);
  ctx.restore();
}

export function releaseCapture(element: HTMLElement | null, pointerId: number) {
  if (element?.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
}
