import type { CellRect, StitchPattern } from "@/lib/types";

// The Image window's target on-screen width: cell size derives from it, so a small pattern isn't tiny and a large one fits.
const IMAGE_WINDOW_TARGET_WIDTH_PX = 720;
const IMAGE_WINDOW_MAX_CELL_SIZE = 28;
const IMAGE_WINDOW_MIN_CELL_SIZE = 4;
// Caps the zoomed canvas like render.ts's export budget, so 4x zoom on the largest pattern can't request a huge canvas.
const IMAGE_WINDOW_MAX_ZOOMED_CANVAS_PX = 8000;

/** The photo underlay's opacity in Grid + photo mode, so the symbol grid stays the readable layer. */
export const PHOTO_UNDERLAY_ALPHA = 0.55;

/** On-screen cell size. Zoom re-renders at a higher resolution rather than scaling pixels, so symbols appear when zoomed in. */
export function computeCellSize(pattern: StitchPattern | null, zoomLevel: number): number {
  if (!pattern) return IMAGE_WINDOW_MAX_CELL_SIZE;
  const longer = Math.max(pattern.width, pattern.height);
  const base = Math.max(IMAGE_WINDOW_MIN_CELL_SIZE, Math.min(IMAGE_WINDOW_MAX_CELL_SIZE, Math.floor(IMAGE_WINDOW_TARGET_WIDTH_PX / longer)));
  return Math.min(Math.round(base * zoomLevel), Math.floor(IMAGE_WINDOW_MAX_ZOOMED_CANVAS_PX / longer));
}

export interface PointerPosition {
  clientX: number;
  clientY: number;
}

function cellFromEvent(e: PointerPosition, canvas: HTMLCanvasElement, cellSize: number): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: Math.floor(((e.clientX - rect.left) * scaleX) / cellSize),
    y: Math.floor(((e.clientY - rect.top) * scaleY) / cellSize),
  };
}

/** The row-major cell index under the pointer, or null outside the grid. */
export function cellIndexFromEvent(e: PointerPosition, canvas: HTMLCanvasElement, cellSize: number, width: number, height: number): number | null {
  const { x, y } = cellFromEvent(e, canvas, cellSize);
  if (x < 0 || x >= width || y < 0 || y >= height) return null;
  return y * width + x;
}

/** Like `cellIndexFromEvent` but clamped to the grid, so a drag that drifts past the edge keeps tracking. */
export function clampedCellFromEvent(e: PointerPosition, canvas: HTMLCanvasElement, cellSize: number, width: number, height: number): { x: number; y: number } {
  const { x, y } = cellFromEvent(e, canvas, cellSize);
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

/** A copy of the canvas: the pre-gesture image a Move or Select drag blits back per pointer event (D104). */
export function snapshotCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const copy = document.createElement("canvas");
  copy.width = source.width;
  copy.height = source.height;
  copy.getContext("2d")?.drawImage(source, 0, 0);
  return copy;
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

export function releaseCapture(canvas: HTMLCanvasElement | null, pointerId: number) {
  if (canvas?.hasPointerCapture(pointerId)) canvas.releasePointerCapture(pointerId);
}
