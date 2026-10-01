import { EMPTY_CELL, type StitchPattern } from "../types";

/**
 * Half stitches (G-082). A cell holds a whole stitch or half of one: a thread laid along one diagonal of the cell.
 *
 * - `STITCH_WHOLE` (0): the whole cross, as every cell has always been.
 * - `STITCH_SLASH` (1), written "/": the thread from the bottom-left corner to the top-right, so the top-left and
 *   bottom-right corners are cut away when it is drawn.
 * - `STITCH_BACKSLASH` (2), written "\": top-left to bottom-right, so the top-right and bottom-left corners are cut away.
 *
 * A chart keeps the kinds in `cellKind`, one byte per cell beside `cellPalette` and indexed the same way, and has none at
 * all while every stitch is whole. An empty cell is always whole (D258).
 */
export const STITCH_WHOLE = 0;
export const STITCH_SLASH = 1;
export const STITCH_BACKSLASH = 2;
export type StitchKind = 0 | 1 | 2;

export const STITCH_KIND_LABELS: Record<StitchKind, string> = {
  0: "Whole stitch",
  1: "Half stitch /",
  2: "Half stitch \\",
};

export function isStitchKind(value: unknown): value is StitchKind {
  return value === STITCH_WHOLE || value === STITCH_SLASH || value === STITCH_BACKSLASH;
}

/** "/" becomes "\" and back; a whole stitch is its own mirror image. */
export function swapKind(kind: number): number {
  return kind === STITCH_SLASH ? STITCH_BACKSLASH : kind === STITCH_BACKSLASH ? STITCH_SLASH : kind;
}

/**
 * The kind a half stitch becomes when the cell is carried by the signed permutation `[a, b, c, d]` (`x' = a·x + b·y`,
 * `y' = c·x + d·y`, y pointing down), as the symmetry group's elements and every flip and quarter turn are. A "/" runs along
 * (1, −1) and a "\" along (1, 1); whichever direction the image runs along names the new kind. So a mirror across the
 * vertical or horizontal axis, and a quarter turn, swap the two; a half turn, and a mirror across either diagonal, leave
 * them as they are.
 */
export function kindUnderMatrix(kind: number, [a, b, c, d]: readonly [number, number, number, number]): number {
  if (kind !== STITCH_SLASH && kind !== STITCH_BACKSLASH) return kind;
  const [x, y] = kind === STITCH_SLASH ? [1, -1] : [1, 1];
  const px = a * x + b * y;
  const py = c * x + d * y;
  return px * py < 0 ? STITCH_SLASH : STITCH_BACKSLASH;
}

/** The kind of cell `index`; whole where the chart has no kinds. */
export function kindAt(pattern: Pick<StitchPattern, "cellKind">, index: number): number {
  return pattern.cellKind?.[index] ?? STITCH_WHOLE;
}

/** Whether any stitch of the chart is a half stitch. */
export function hasHalfStitches(pattern: Pick<StitchPattern, "cellKind">): boolean {
  const kinds = pattern.cellKind;
  if (!kinds) return false;
  for (const kind of kinds) if (kind !== STITCH_WHOLE) return true;
  return false;
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

/**
 * The kinds after a tool that knows nothing about half stitches repainted `after` over `before`: a cell whose value changed
 * is a whole stitch now, and one that did not keeps its kind.
 */
export function kindsAfterWholePainting(
  before: Pick<StitchPattern, "cellPalette" | "cellKind">,
  after: ArrayLike<number>
): Uint8Array | undefined {
  const kinds = before.cellKind;
  if (!kinds) return undefined;
  const out = kinds.slice();
  for (let i = 0; i < out.length; i++) if (after[i] !== before.cellPalette[i]) out[i] = STITCH_WHOLE;
  return out;
}

/** A buffer of `length` cells all of one kind, for a tool's working copy. */
export function kindBuffer(pattern: Pick<StitchPattern, "cellKind" | "cellPalette">): Uint8Array {
  return pattern.cellKind ? pattern.cellKind.slice() : new Uint8Array(pattern.cellPalette.length);
}

/** The cells in each kind, for the legend and the counts: `[whole, slash, backslash]`. */
export function kindCounts(pattern: Pick<StitchPattern, "cellPalette" | "cellKind">, paletteIndex?: number): [number, number, number] {
  const counts: [number, number, number] = [0, 0, 0];
  const { cellPalette, cellKind } = pattern;
  for (let i = 0; i < cellPalette.length; i++) {
    const value = cellPalette[i];
    if (value === EMPTY_CELL || (paletteIndex !== undefined && value !== paletteIndex)) continue;
    counts[cellKind?.[i] ?? STITCH_WHOLE]++;
  }
  return counts;
}
