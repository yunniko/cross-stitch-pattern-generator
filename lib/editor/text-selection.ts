import { EMPTY_CELL, type FloatingSelection } from "../types";
import { DUPLICATE_OFFSET } from "./floating-selection";
import type { LetteringBitmap } from "./text-raster";

/**
 * Lettering as a piece in hand (G-081): the stitches of the text in one thread, with a mask of exactly those stitches, so
 * putting the piece down stamps the letters and leaves what lies behind them. It has no `originRect`: nothing was lifted
 * from the chart, so nothing is vacated. From there it is any floating selection, and the chart does not remember the text.
 */
export function letteringSelection(bitmap: LetteringBitmap, paletteIndex: number, x: number, y: number): FloatingSelection {
  const cells = new Uint8Array(bitmap.ink.length).fill(EMPTY_CELL);
  for (let i = 0; i < bitmap.ink.length; i++) if (bitmap.ink[i]) cells[i] = paletteIndex;
  return { x, y, width: bitmap.width, height: bitmap.height, cells, mask: Uint8Array.from(bitmap.ink) };
}

/**
 * Where the lettering starts, as Paste starts a piece: three stitches down and right of the piece that was in hand, and with
 * none, three stitches in from the corner of the part of the chart in view. Kept inside the chart, which the piece fits (the
 * tab refuses one that does not).
 */
export function letteringStart(
  inHand: { x: number; y: number } | null,
  viewCorner: { x: number; y: number },
  piece: { width: number; height: number },
  chart: { width: number; height: number }
): { x: number; y: number } {
  const from = inHand ?? viewCorner;
  return {
    x: Math.max(0, Math.min(chart.width - piece.width, from.x + DUPLICATE_OFFSET)),
    y: Math.max(0, Math.min(chart.height - piece.height, from.y + DUPLICATE_OFFSET)),
  };
}
