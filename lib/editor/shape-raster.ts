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

/** Whether a shape is drawn as its outline or as a solid block of stitches (G-064). */
export type ShapeFill = "outline" | "filled";

/** The box a drag from one corner to another covers, in cells: both corners included, whichever way it was drawn. */
function boxOf(from: CellPoint, to: CellPoint) {
  const x0 = Math.min(from.x, to.x);
  const y0 = Math.min(from.y, to.y);
  return { x0, y0, width: Math.abs(to.x - from.x) + 1, height: Math.abs(to.y - from.y) + 1 };
}

/** The rectangle between two corners: its four sides, or every stitch inside it. Row-major, each cell once. */
export function rectCells(from: CellPoint, to: CellPoint, fill: ShapeFill): CellPoint[] {
  const { x0, y0, width, height } = boxOf(from, to);
  const cells: CellPoint[] = [];
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      const onEdge = i === 0 || j === 0 || i === width - 1 || j === height - 1;
      if (fill === "filled" || onEdge) cells.push({ x: x0 + i, y: y0 + j });
    }
  }
  return cells;
}

/**
 * Is the cell at column `i`, row `j` of a `width` x `height` box inside the ellipse inscribed in it? The cell's centre
 * sits at (i + 1/2, j + 1/2), so the test is ((2i+1-w)/w)^2 + ((2j+1-h)/h)^2 <= 1 -- multiplied out below, which keeps
 * it exact integer arithmetic: a stitch is in or out, never half-covered.
 */
function insideEllipse(i: number, j: number, width: number, height: number): boolean {
  if (i < 0 || j < 0 || i >= width || j >= height) return false;
  const dx = (2 * i + 1 - width) * height;
  const dy = (2 * j + 1 - height) * width;
  return dx * dx + dy * dy <= width * width * height * height;
}

/**
 * The ellipse inscribed in the box between two corners: the stitches inside it, or the ring of those that have a
 * neighbour outside. A one-cell-wide or one-cell-tall box gives the straight run it degenerates to.
 */
export function ovalCells(from: CellPoint, to: CellPoint, fill: ShapeFill): CellPoint[] {
  const { x0, y0, width, height } = boxOf(from, to);
  const cells: CellPoint[] = [];
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      if (!insideEllipse(i, j, width, height)) continue;
      const edge =
        !insideEllipse(i - 1, j, width, height) ||
        !insideEllipse(i + 1, j, width, height) ||
        !insideEllipse(i, j - 1, width, height) ||
        !insideEllipse(i, j + 1, width, height);
      if (fill === "filled" || edge) cells.push({ x: x0 + i, y: y0 + j });
    }
  }
  return cells;
}
