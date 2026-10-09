import { EMPTY_CELL } from "../types";

/**
 * Half stitches (G-082). A cell holds a whole stitch or half of one: a thread laid along one diagonal of the cell.
 *
 * - `STITCH_WHOLE` (0): the whole cross, as every cell has always been.
 * - `STITCH_SLASH` (1), written "/": the thread from the bottom-left corner to the top-right, so the top-left and
 *   bottom-right corners are cut away when it is drawn.
 * - `STITCH_BACKSLASH` (2), written "\": top-left to bottom-right, so the top-right and bottom-left corners are cut away.
 *
 * A chart keeps the kinds in `cellKind`, one byte per cell beside `cellPalette` and indexed the same way, and has none at
 * all while every stitch is whole. An empty cell is always whole (D258). The encoding is the document's, here; what the
 * editor and the exports do with it is in `lib/editor/stitch-kind.ts`.
 */
export const STITCH_WHOLE = 0;
export const STITCH_SLASH = 1;
export const STITCH_BACKSLASH = 2;
export type StitchKind = 0 | 1 | 2;

export function isStitchKind(value: unknown): value is StitchKind {
  return value === STITCH_WHOLE || value === STITCH_SLASH || value === STITCH_BACKSLASH;
}

/**
 * The kinds a buffer of cells may keep: an empty cell is whole, and a chart with no half stitch has no array at all.
 * Returns `undefined` for that case, else a fresh copy; throws when the lengths disagree, which no caller may let happen.
 */
export function tidyKinds(cells: ArrayLike<number>, kinds: Uint8Array | undefined): Uint8Array | undefined {
  if (!kinds) return undefined;
  if (kinds.length !== cells.length) throw new Error("The stitch kinds don't match the cells in size.");
  let any = false;
  const out = kinds.slice();
  for (let i = 0; i < out.length; i++) {
    if (cells[i] === EMPTY_CELL) out[i] = STITCH_WHOLE;
    if (out[i] !== STITCH_WHOLE) any = true;
  }
  return any ? out : undefined;
}
