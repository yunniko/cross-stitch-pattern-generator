import type { ChartRegion } from "@/lib/export/render";

/**
 * Geometry of the Image window's viewport canvas (G-036 M3): a chart-sized frame is the layout and input surface, and
 * one canvas inside it holds only the painted part of the chart. Every rectangle here is in chart pixels: the chart's
 * top-left stitch corner is (0, 0) and the chart is `width × cellSize` by `height × cellSize`. See D135.
 */

/** A rectangle in chart pixels, end-exclusive. Bitmap rectangles always have integer bounds. */
export interface PixelRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function isEmptyRect(r: PixelRect): boolean {
  return r.x1 <= r.x0 || r.y1 <= r.y0;
}

/**
 * The part of the chart inside the scroller's client area, in chart pixels (possibly fractional). `contentLeft` and
 * `contentTop` are the frame's content-box origin in client coordinates; `view` is the scroller's client rectangle in
 * client coordinates, excluding scrollbars.
 */
export function visibleChartRect(
  contentLeft: number,
  contentTop: number,
  view: { left: number; top: number; right: number; bottom: number },
  chartWidthPx: number,
  chartHeightPx: number
): PixelRect {
  return {
    x0: Math.max(0, view.left - contentLeft),
    y0: Math.max(0, view.top - contentTop),
    x1: Math.min(chartWidthPx, view.right - contentLeft),
    y1: Math.min(chartHeightPx, view.bottom - contentTop),
  };
}

/**
 * The bitmap to paint for a visible rectangle: grown by `overscanX`/`overscanY` on each side, rounded outward to whole
 * chart pixels and clamped to the chart, so drawing never runs at a fractional offset (D134 relies on integer-aligned
 * fills) and the chart's outer gridlines stay clipped exactly as on a full-size canvas.
 */
export function paintedRectFor(visible: PixelRect, overscanX: number, overscanY: number, chartWidthPx: number, chartHeightPx: number): PixelRect {
  if (isEmptyRect(visible)) return { x0: 0, y0: 0, x1: 0, y1: 0 };
  return {
    x0: Math.max(0, Math.floor(visible.x0 - overscanX)),
    y0: Math.max(0, Math.floor(visible.y0 - overscanY)),
    x1: Math.min(chartWidthPx, Math.ceil(visible.x1 + overscanX)),
    y1: Math.min(chartHeightPx, Math.ceil(visible.y1 + overscanY)),
  };
}

/**
 * True when `painted` no longer covers `visible` grown by `margin` (clamped to the chart), so the next scroll could
 * expose unpainted chart before the main thread repaints.
 */
export function needsRepaint(visible: PixelRect, painted: PixelRect, margin: number, chartWidthPx: number, chartHeightPx: number): boolean {
  if (isEmptyRect(visible)) return false;
  if (isEmptyRect(painted)) return true;
  return (
    Math.max(0, visible.x0 - margin) < painted.x0 ||
    Math.max(0, visible.y0 - margin) < painted.y0 ||
    Math.min(chartWidthPx, visible.x1 + margin) > painted.x1 ||
    Math.min(chartHeightPx, visible.y1 + margin) > painted.y1
  );
}

/**
 * How many stitches beyond a bitmap edge can still paint into it: a symbol's glyph or halo reaching past its own cell,
 * or half of the widest gridline stroke. `overhangPx` is the largest distance any paint extends past its cell's edge.
 * One stitch more covers antialiasing at the boundary.
 */
export function guardCells(overhangPx: number, cellSize: number): number {
  return Math.ceil(Math.max(0, overhangPx) / cellSize) + 1;
}

/** The stitches to draw so that every pixel of `bitmap` receives exactly the paint a full-chart render gives it. */
export function cellRegionFor(bitmap: PixelRect, cellSize: number, guard: number, width: number, height: number): ChartRegion {
  return {
    x0: Math.max(0, Math.floor(bitmap.x0 / cellSize) - guard),
    y0: Math.max(0, Math.floor(bitmap.y0 / cellSize) - guard),
    x1: Math.min(width, Math.ceil(bitmap.x1 / cellSize) + guard),
    y1: Math.min(height, Math.ceil(bitmap.y1 / cellSize) + guard),
  };
}

/** The stitch under a client position, in the frame's content-box coordinates; may lie outside the chart. */
export function cellAtClient(clientX: number, clientY: number, contentLeft: number, contentTop: number, cellSize: number): { x: number; y: number } {
  return { x: Math.floor((clientX - contentLeft) / cellSize), y: Math.floor((clientY - contentTop) / cellSize) };
}

/**
 * Where the Move preview's four wrap-around copies of the chart land, in chart pixels: the same offsets the pre-G-036
 * snapshot blit used, `((dx mod width) × cellSize, (dy mod height) × cellSize)` and the copies one chart to the left
 * and above.
 */
export function moveTileOffsets(dx: number, dy: number, width: number, height: number, cellSize: number): Array<{ x: number; y: number }> {
  const w = width * cellSize;
  const h = height * cellSize;
  const ox = (((dx % width) + width) % width) * cellSize;
  const oy = (((dy % height) + height) % height) * cellSize;
  return [
    { x: ox, y: oy },
    { x: ox - w, y: oy },
    { x: ox, y: oy - h },
    { x: ox - w, y: oy - h },
  ];
}

/** The intersection of two rectangles; empty rectangles are returned with x1 <= x0 or y1 <= y0. */
export function intersectRects(a: PixelRect, b: PixelRect): PixelRect {
  return { x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) };
}
