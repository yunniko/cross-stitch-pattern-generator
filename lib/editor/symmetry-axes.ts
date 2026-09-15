/**
 * The symmetry axes and the square-only rule, with no other dependencies (G-037, D137), so the file format, autosave
 * and export code can use them without loading the pattern editing and colour-name modules. The geometry built on them
 * is in `symmetry.ts`, which re-exports everything here.
 */
export type SymmetryAxis = "vertical" | "horizontal" | "diagonal" | "antidiagonal";

export const SYMMETRY_AXES: readonly SymmetryAxis[] = ["vertical", "horizontal", "diagonal", "antidiagonal"];

export type SymmetryAxes = Readonly<Record<SymmetryAxis, boolean>>;

export const NO_SYMMETRY: SymmetryAxes = { vertical: false, horizontal: false, diagonal: false, antidiagonal: false };

/** The axes that apply on a `width` × `height` canvas: diagonals only exist on a square one (Owner, 2026-09-15). */
export function effectiveSymmetryAxes(axes: SymmetryAxes, width: number, height: number): SymmetryAxes {
  if (width === height || (!axes.diagonal && !axes.antidiagonal)) return axes;
  return { ...axes, diagonal: false, antidiagonal: false };
}
