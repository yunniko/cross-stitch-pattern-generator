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

/** The press that covers the one stitch under the pointer: what size 1 gives, and what a filled shape uses. */
export const ONE_STITCH_STAMP: readonly StampOffset[] = [{ dx: 0, dy: 0 }];

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

/** One edge of the stamp's boundary, in cell units and relative to the stamp's centre cell's top-left corner. */
export interface StampEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * The boundary of a stamp (G-065): the edges of its cells that have no cell of the stamp on the other side, which is
 * what makes a round brush read as one staircase ring rather than a grid of little squares. Edges are in cell units,
 * so a caller multiplies by the cell size; `(0, 0)` is the top-left corner of the cell under the pointer.
 *
 * Deterministic order: cell by cell as `brushStamp` gives them, then top, right, bottom, left.
 */
export function stampOutline(stamp: readonly StampOffset[]): StampEdge[] {
  const inside = new Set(stamp.map(({ dx, dy }) => `${dx},${dy}`));
  const edges: StampEdge[] = [];
  for (const { dx, dy } of stamp) {
    // Each edge is drawn only by the cell inside the stamp, so a shared edge between two stamp cells is drawn by
    // neither and the boundary comes out as a single closed run.
    if (!inside.has(`${dx},${dy - 1}`)) edges.push({ x1: dx, y1: dy, x2: dx + 1, y2: dy });
    if (!inside.has(`${dx + 1},${dy}`)) edges.push({ x1: dx + 1, y1: dy, x2: dx + 1, y2: dy + 1 });
    if (!inside.has(`${dx},${dy + 1}`)) edges.push({ x1: dx, y1: dy + 1, x2: dx + 1, y2: dy + 1 });
    if (!inside.has(`${dx - 1},${dy}`)) edges.push({ x1: dx, y1: dy, x2: dx, y2: dy + 1 });
  }
  return edges;
}
