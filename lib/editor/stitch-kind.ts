import { isStitchKind, STITCH_BACKSLASH, STITCH_SLASH, STITCH_WHOLE, tidyKinds, type StitchKind } from "../document/stitch-kind";
import { EMPTY_CELL, type StitchPattern } from "../types";

/** Half stitches (G-082, D258) as the editor and the exports use them; their encoding is the document's. */
export { isStitchKind, STITCH_BACKSLASH, STITCH_SLASH, STITCH_WHOLE, tidyKinds, type StitchKind };

export const STITCH_KIND_LABELS: Record<StitchKind, string> = {
  0: "Whole stitch",
  1: "Half stitch /",
  2: "Half stitch \\",
};

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

/** Whether any stitch of the chart is a half stitch. */
export function hasHalfStitches(pattern: Pick<StitchPattern, "cellKind">): boolean {
  const kinds = pattern.cellKind;
  if (!kinds) return false;
  for (const kind of kinds) if (kind !== STITCH_WHOLE) return true;
  return false;
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

/** What a thread's stitches amount to for buying: a half stitch is half a stitch of thread, rounded up. */
export function threadStitches(pattern: Pick<StitchPattern, "palette" | "cellPalette" | "cellKind">, paletteIndex: number): number {
  if (!hasHalfStitches(pattern)) return pattern.palette[paletteIndex].count;
  const [whole, slash, backslash] = kindCounts(pattern, paletteIndex);
  return whole + Math.ceil((slash + backslash) / 2);
}

/** The chart as the Pattern Keeper PDF and the OXS file carry it: every half stitch a whole one (Owner, 2026-10-01). */
export function wholeStitches<T extends Pick<StitchPattern, "cellKind">>(pattern: T): T {
  return pattern.cellKind ? { ...pattern, cellKind: undefined } : pattern;
}
