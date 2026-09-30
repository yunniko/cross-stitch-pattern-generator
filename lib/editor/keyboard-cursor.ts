/**
 * The keyboard cell cursor (G-080): the arrow keys move the highlighted stitch one stitch at a time, Shift moves it ten,
 * and the cursor stops at the chart's edge rather than leaving it. Pure, so the stepping is tested without a page.
 */
export interface CellPoint {
  x: number;
  y: number;
}

/** How far Shift+arrow moves: the same ten the rulers number. */
export const SHIFT_STEP = 10;

export const ARROW_DIRECTIONS: Readonly<Record<string, CellPoint>> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

/** `from` moved `steps` stitches in `direction`, held inside a `width` × `height` chart. */
export function stepCell(from: CellPoint, direction: CellPoint, steps: number, width: number, height: number): CellPoint {
  return {
    x: Math.max(0, Math.min(width - 1, from.x + direction.x * steps)),
    y: Math.max(0, Math.min(height - 1, from.y + direction.y * steps)),
  };
}

/** Where the cursor starts when the keyboard takes over: under the pointer if it is over the chart, else the middle. */
export function startCell(underPointer: CellPoint | null, width: number, height: number): CellPoint {
  return underPointer ?? { x: Math.floor((width - 1) / 2), y: Math.floor((height - 1) / 2) };
}
