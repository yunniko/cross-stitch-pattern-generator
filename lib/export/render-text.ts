import type { ChartDrawingContext } from "./chart-drawing-context";
import { formatFinishedSize, type SizeUnit } from "./finished-size";
import { filledStitchCount, formatStitchCount, type StitchPattern } from "../types";

/**
 * The words on a chart, separate from the drawing of it (G-067 M5).
 *
 * `render.ts` is the chart rasteriser and these two were the only exports in it that had nothing to do with a
 * canvas full of stitches: one builds a caption from a pattern, the other shortens a string to fit. They are here so
 * a caller that only needs the header text — an export deciding a page title, a test asserting a caption — does not
 * reach into the rasteriser to get it. See D219 for why the rest of `render.ts` stays together.
 */

/** The caption above a chart: size, stitch count, finished size, and the author when there is one. */
export function headerText(pattern: StitchPattern, aidaCount: number, sizeUnit: SizeUnit, authorName?: string): string {
  const base = `${pattern.width} × ${pattern.height} grid, ${formatStitchCount(filledStitchCount(pattern))} — approx. ${formatFinishedSize(pattern.width, pattern.height, aidaCount, sizeUnit)} on ${aidaCount}-count Aida`;
  return authorName?.trim() ? `${base} — Designed by ${authorName.trim()}` : base;
}

/**
 * `text` shortened with an ellipsis until it measures within `maxWidth`, by binary search rather than a character at
 * a time — a legend can hold a hundred names and each one is measured against the same context.
 */
export function truncateToWidth(ctx: ChartDrawingContext, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = `${text.slice(0, mid)}…`;
    if (ctx.measureText(candidate).width <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return low > 0 ? `${text.slice(0, low)}…` : "…";
}
