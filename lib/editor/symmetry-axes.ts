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

/**
 * The reflection group the active axes generate (G-037, moved here in G-073).
 *
 * It lives in this module, not in `symmetry.ts`, because that one reaches the pattern editor and the colour-name
 * tables through `pattern-edit` — and the file format, autosave and backstitch geometry need the group without
 * any of that. Importing it from the heavy side pulled a UMD colour bundle into the e2e runner's Node context
 * and broke every spec that touches a saved file (2026-09-25).
 */
/**
 * A transform of doubled centred coordinates `u = 2x − (W−1)`, `v = 2y − (H−1)`, which keeps every reflection an exact
 * integer map: `u' = a·u + b·v`, `v' = c·u + d·v`. Only signed permutation matrices occur.
 */
export type SymmetryMatrix = readonly [a: number, b: number, c: number, d: number];

const IDENTITY: SymmetryMatrix = [1, 0, 0, 1];

const REFLECTIONS: Record<SymmetryAxis, SymmetryMatrix> = {
  vertical: [-1, 0, 0, 1],
  horizontal: [1, 0, 0, -1],
  diagonal: [0, 1, 1, 0],
  antidiagonal: [0, -1, -1, 0],
};

/** `m ∘ n`: apply `n`, then `m`. Entries are normalised so a product never holds -0. */
export function composeMatrices(m: SymmetryMatrix, n: SymmetryMatrix): SymmetryMatrix {
  const entry = (value: number) => value || 0;
  return [
    entry(m[0] * n[0] + m[1] * n[2]),
    entry(m[0] * n[1] + m[1] * n[3]),
    entry(m[2] * n[0] + m[3] * n[2]),
    entry(m[2] * n[1] + m[3] * n[3]),
  ];
}

const sameMatrix = (m: SymmetryMatrix, n: SymmetryMatrix) => m[0] === n[0] && m[1] === n[1] && m[2] === n[2] && m[3] === n[3];

const groupCache = new Map<number, readonly SymmetryMatrix[]>();

function axisMask(axes: SymmetryAxes): number {
  return SYMMETRY_AXES.reduce((mask, axis, bit) => (axes[axis] ? mask | (1 << bit) : mask), 0);
}

/** The group the axes generate: the identity plus every product of their reflections, closed under composition. */
export function symmetryGroup(axes: SymmetryAxes): readonly SymmetryMatrix[] {
  const mask = axisMask(axes);
  const cached = groupCache.get(mask);
  if (cached) return cached;
  const generators = SYMMETRY_AXES.filter((axis) => axes[axis]).map((axis) => REFLECTIONS[axis]);
  const group: SymmetryMatrix[] = [IDENTITY];
  for (let i = 0; i < group.length; i++) {
    for (const generator of generators) {
      const product = composeMatrices(generator, group[i]);
      if (!group.some((element) => sameMatrix(element, product))) group.push(product);
    }
  }
  groupCache.set(mask, group);
  return group;
}
