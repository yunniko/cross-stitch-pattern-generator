/**
 * The cells a shape covers (G-064). A chart is discrete, so every rasteriser here is integer work on whole stitches:
 * no anti-aliasing, no sub-cell geometry, and no cell half-covered by a colour. Each returns the shape's *spine* --
 * the cells the tool then stamps the brush on -- so thickness belongs to the brush, not to the shape.
 *
 * Coordinates are cell columns and rows. Nothing here clips to the chart: the tool clamps its own ends, and
 * `stampCells` drops whatever falls outside.
 */

export interface CellPoint {
  x: number;
  y: number;
}

/**
 * Bresenham's line, both ends included, ordered from `from` to `to` and with no cell twice. Integer throughout, and
 * the same cells whichever end the drag started from: Bresenham picks a side when the error ties exactly, so the run
 * is always rasterised from the lower end and turned round afterwards rather than being allowed to depend on which
 * stitch the pointer went down on.
 */
export function lineCells(from: CellPoint, to: CellPoint): CellPoint[] {
  if (to.x < from.x || (to.x === from.x && to.y < from.y)) return lineCells(to, from).reverse();
  const dx = Math.abs(to.x - from.x);
  const dy = -Math.abs(to.y - from.y);
  const stepX = from.x < to.x ? 1 : -1;
  const stepY = from.y < to.y ? 1 : -1;
  let error = dx + dy;
  let x = from.x;
  let y = from.y;
  const cells: CellPoint[] = [];
  for (;;) {
    cells.push({ x, y });
    if (x === to.x && y === to.y) return cells;
    // Doubling the error is what keeps the decision integer: it compares the two candidate steps without a division.
    const twice = 2 * error;
    if (twice >= dy) {
      error += dy;
      x += stepX;
    }
    if (twice <= dx) {
      error += dx;
      y += stepY;
    }
  }
}
