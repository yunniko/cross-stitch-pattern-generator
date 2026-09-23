/**
 * What one press of the brush covers (G-064): a set of cell offsets around the stitch under the pointer.
 *
 * Sizes are odd only (Owner, 2026-09-23), which is what makes this simple: an odd square has a true centre cell, so
 * a stamp is symmetric about the pointer and no rule is needed for which way an even one leans.
 */

export type BrushShape = "square" | "round";

/** The sizes the pane offers, in stitches across. Odd only, so every stamp has a centre. */
export const BRUSH_SIZES = [1, 3, 5, 7, 9, 11, 13, 15] as const;
export type BrushSize = (typeof BRUSH_SIZES)[number];

export const DEFAULT_BRUSH_SIZE: BrushSize = 1;
export const DEFAULT_BRUSH_SHAPE: BrushShape = "round";

export interface StampOffset {
  dx: number;
  dy: number;
}

/**
 * The offsets one press covers, centred on (0, 0) and ordered row by row so two calls with the same arguments give
 * the same array. A square covers its whole block; a round brush keeps the cells whose centres fall inside the
 * circle that fits the block, which is what makes 3 a plus sign rather than a 3x3 square.
 */
export function brushStamp(size: number, shape: BrushShape): StampOffset[] {
  const radius = Math.floor(Math.max(1, size) / 2);
  const offsets: StampOffset[] = [];
  // A cell is in when its centre is within the radius; comparing squares keeps this integer work.
  const limit = (radius + 0.5) * (radius + 0.5);
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (shape === "round" && dx * dx + dy * dy > limit) continue;
      // `-radius` is -0 at size 1, which is a different value to 0 for equality and for any "dx,dy" key built from it.
      offsets.push({ dx: dx === 0 ? 0 : dx, dy: dy === 0 ? 0 : dy });
    }
  }
  return offsets;
}

/** The cells a press at `cellIndex` covers, clipped to the chart. Row-major indices, each appearing once. */
export function stampCells(cellIndex: number, width: number, height: number, stamp: readonly StampOffset[]): number[] {
  const x = cellIndex % width;
  const y = Math.floor(cellIndex / width);
  const cells: number[] = [];
  for (const { dx, dy } of stamp) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    cells.push(ny * width + nx);
  }
  return cells;
}
