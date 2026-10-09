/**
 * Moving a plane of one byte a stitch (stitches or their kinds) about its grid: shared by the flat chart's edits
 * (`lib/editor/pattern-edit.ts`) and by every stitch layer of a document (`layer-kinds.ts`), so the two cannot drift.
 */

/** Signed per-edge cell counts -- positive expands that edge, negative crops it, 0 leaves it alone. */
export interface CanvasResizeDelta {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * A buffer shifted by whole cells with wrap-around. Two whole-row copies per row rather than a modulo per cell: the tail of
 * the source row wraps to the front (G-039 M2, same bytes as the per-cell form).
 */
export function wrapShift(source: Uint8Array, width: number, height: number, dx: number, dy: number): Uint8Array {
  const shifted = new Uint8Array(source.length);
  const offsetX = ((dx % width) + width) % width;
  for (let y = 0; y < height; y++) {
    const srcY = ((((y - dy) % height) + height) % height) * width;
    const destY = y * width;
    shifted.set(source.subarray(srcY + width - offsetX, srcY + width), destY);
    shifted.set(source.subarray(srcY, srcY + width - offsetX), destY + offsetX);
  }
  return shifted;
}

/** A plane cropped and/or expanded at its edges; a newly exposed cell holds `fill`. */
export function resizePlane(source: Uint8Array, width: number, height: number, delta: CanvasResizeDelta, fill: number): Uint8Array {
  const newWidth = width + delta.left + delta.right;
  const newHeight = height + delta.top + delta.bottom;
  const plane = new Uint8Array(newWidth * newHeight);
  for (let ny = 0; ny < newHeight; ny++) {
    const oy = ny - delta.top;
    const inRowBounds = oy >= 0 && oy < height;
    for (let nx = 0; nx < newWidth; nx++) {
      const ox = nx - delta.left;
      plane[ny * newWidth + nx] = inRowBounds && ox >= 0 && ox < width ? source[oy * width + ox] : fill;
    }
  }
  return plane;
}
