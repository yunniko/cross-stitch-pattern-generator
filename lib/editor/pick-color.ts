import { hitLine } from "./backstitch";
import type { StitchPattern } from "@/lib/types";

/**
 * The colour a picker press takes (G-104), at `(x, y)` in stitches from the chart's top left, unrounded. On a backstitch
 * line it is the line's thread (where lines overlap, the one drawn on top, as a press on the line takes it); anywhere else
 * the stitch of the cell under the pointer, whole or half, and from an empty cell the empty stitch, as any colour is
 * (Owner, 2026-10-06).
 */
export function colorAt(pattern: Pick<StitchPattern, "width" | "height" | "cellPalette" | "backstitch">, x: number, y: number): number {
  const lines = pattern.backstitch ?? [];
  const line = hitLine(lines, x, y);
  if (line) return lines[line.index].paletteIndex;
  // A point on the chart's far edge is in the last cell, not past it.
  const column = Math.min(pattern.width - 1, Math.max(0, Math.floor(x)));
  const row = Math.min(pattern.height - 1, Math.max(0, Math.floor(y)));
  return pattern.cellPalette[row * pattern.width + column];
}
