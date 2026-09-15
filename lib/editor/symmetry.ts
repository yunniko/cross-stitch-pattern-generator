import { labelRegions } from "../pipeline/regions";
import { EMPTY_CELL, type StitchPattern } from "../types";
import { withCellPalette } from "./pattern-edit";
import { effectiveSymmetryAxes, SYMMETRY_AXES, type SymmetryAxes, type SymmetryAxis } from "./symmetry-axes";

export { effectiveSymmetryAxes, NO_SYMMETRY, SYMMETRY_AXES, type SymmetryAxes, type SymmetryAxis } from "./symmetry-axes";

/**
 * Symmetry geometry for drawing and quick mirror (G-037, D137). Every axis passes through the canvas centre:
 * - `vertical`: the vertical centre line, mirroring left and right, `x → W−1−x`;
 * - `horizontal`: the horizontal centre line, mirroring up and down, `y → H−1−y`;
 * - `diagonal`: top-left to bottom-right, `(x, y) → (y, x)`, square canvases only;
 * - `antidiagonal`: top-right to bottom-left, `(x, y) → (N−1−y, N−1−x)`, square canvases only.
 * The active axes generate a group (order 1, 2, 4 or 8); a cell's orbit under it is every cell one action touches.
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
  return [entry(m[0] * n[0] + m[1] * n[2]), entry(m[0] * n[1] + m[1] * n[3]), entry(m[2] * n[0] + m[3] * n[2]), entry(m[2] * n[1] + m[3] * n[3])];
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

function assertDimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error(`Symmetry needs a canvas of whole, positive dimensions (got ${width} × ${height}).`);
  }
}

function assertCell(cellIndex: number, width: number, height: number) {
  if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex >= width * height) {
    throw new Error(`Cell ${cellIndex} is not on a ${width} × ${height} canvas.`);
  }
}

function assertPattern(pattern: StitchPattern) {
  assertDimensions(pattern.width, pattern.height);
  if (pattern.cellPalette.length !== pattern.width * pattern.height) {
    throw new Error("The pattern's cell buffer doesn't match its size.");
  }
}

/**
 * Every cell the active axes map `cellIndex` to, itself included, each once, in group order. Diagonals are ignored on a
 * non-square canvas. A cell on an axis, or at the centre, has fewer distinct copies than the group has elements.
 */
export function symmetryOrbit(cellIndex: number, width: number, height: number, axes: SymmetryAxes): number[] {
  assertDimensions(width, height);
  assertCell(cellIndex, width, height);
  const u = 2 * (cellIndex % width) - (width - 1);
  const v = 2 * Math.floor(cellIndex / width) - (height - 1);
  const orbit: number[] = [];
  for (const [a, b, c, d] of symmetryGroup(effectiveSymmetryAxes(axes, width, height))) {
    const x = (a * u + b * v + (width - 1)) / 2;
    const y = (c * u + d * v + (height - 1)) / 2;
    const index = y * width + x;
    if (!orbit.includes(index)) orbit.push(index);
  }
  return orbit;
}

export type QuickMirror = "left-half" | "upper-half" | "upper-left-corner" | "upper-left-half-corner";

/**
 * The pattern with one part mirrored over the rest, as one new buffer read from the original: `left-half` onto the
 * right, `upper-half` downwards, `upper-left-corner` to the other three quarters, and `upper-left-half-corner` from the
 * triangle along the left edge (`0 ≤ x ≤ y` in the quarter) across the diagonal, then to the other quarters (square
 * canvases only). EMPTY cells are copied like any colour; the palette is kept and stitch counts are recomputed.
 */
export function applyQuickMirror(pattern: StitchPattern, kind: QuickMirror): StitchPattern {
  assertPattern(pattern);
  const { width, height, cellPalette } = pattern;
  if (kind === "upper-left-half-corner" && width !== height) {
    throw new Error("The upper-left half corner mirror needs a square canvas.");
  }
  const cells = new Uint8Array(cellPalette.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sx = x;
      let sy = y;
      if (kind === "left-half" || kind === "upper-left-corner" || kind === "upper-left-half-corner") sx = Math.min(x, width - 1 - x);
      if (kind === "upper-half" || kind === "upper-left-corner" || kind === "upper-left-half-corner") sy = Math.min(y, height - 1 - y);
      if (kind === "upper-left-half-corner" && sx > sy) [sx, sy] = [sy, sx];
      cells[y * width + x] = cellPalette[sy * width + sx];
    }
  }
  return withCellPalette(pattern, cells);
}

/**
 * Fills the region of every cell in `cellIndex`'s orbit with `paletteIndex`: each region as it was before the fill,
 * 4-connected (drop-to-fill) or 8-connected (the Fill tool and double-click), painted as one union. On a pattern that
 * isn't already symmetric the regions differ, so the result can be asymmetric (criterion 2).
 */
export function fillSymmetric(pattern: StitchPattern, cellIndex: number, axes: SymmetryAxes, paletteIndex: number, connectivity: 4 | 8): StitchPattern {
  assertPattern(pattern);
  const { width, height, cellPalette, palette } = pattern;
  assertCell(cellIndex, width, height);
  if (!Number.isInteger(paletteIndex) || (paletteIndex !== EMPTY_CELL && (paletteIndex < 0 || paletteIndex >= palette.length))) {
    throw new Error(`${paletteIndex} is neither a palette colour nor EMPTY.`);
  }
  if (connectivity !== 4 && connectivity !== 8) throw new Error(`Connectivity must be 4 or 8 (got ${connectivity}).`);

  const seeds = symmetryOrbit(cellIndex, width, height, axes);
  const cells = cellPalette.slice();
  if (connectivity === 4) {
    // One labelling pass, then every cell whose region holds a seed.
    const { labels } = labelRegions(cellPalette, width, height);
    const chosen = new Set(seeds.map((seed) => labels[seed]));
    for (let i = 0; i < cells.length; i++) if (chosen.has(labels[i])) cells[i] = paletteIndex;
  } else {
    // 8-connected floods over the original buffer sharing one visited mask: two seeds in one region traverse it once,
    // and a cell reached from one seed can't belong to another seed's differently coloured region.
    const visited = new Uint8Array(cellPalette.length);
    const stack: number[] = [];
    for (const seed of seeds) {
      if (visited[seed]) continue;
      const value = cellPalette[seed];
      visited[seed] = 1;
      stack.push(seed);
      while (stack.length > 0) {
        const cell = stack.pop()!;
        cells[cell] = paletteIndex;
        const x = cell % width;
        const y = (cell - x) / width;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if ((dx === 0 && dy === 0) || nx < 0 || nx >= width) continue;
            const neighbour = ny * width + nx;
            if (visited[neighbour] || cellPalette[neighbour] !== value) continue;
            visited[neighbour] = 1;
            stack.push(neighbour);
          }
        }
      }
    }
  }
  return withCellPalette(pattern, cells);
}
