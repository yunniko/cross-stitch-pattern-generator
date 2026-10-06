import { EMPTY_CELL, type FloatingSelection, type StitchPattern } from "../types";
import { mergeSelection, withCellPalette } from "./pattern-edit";
import { kindUnderMatrix, STITCH_WHOLE } from "./stitch-kind";
import { effectiveSymmetryAxes, symmetryGroup, type SymmetryAxes } from "./symmetry-axes";

export {
  composeMatrices,
  effectiveSymmetryAxes,
  NO_SYMMETRY,
  symmetryGroup,
  SYMMETRY_AXES,
  type SymmetryAxes,
  type SymmetryAxis,
  type SymmetryMatrix,
} from "./symmetry-axes";

/**
 * Symmetry geometry for drawing and quick mirror (G-037, D137). Every axis passes through the canvas centre:
 * - `vertical`: the vertical centre line, mirroring left and right, `x → W−1−x`;
 * - `horizontal`: the horizontal centre line, mirroring up and down, `y → H−1−y`;
 * - `diagonal`: top-left to bottom-right, `(x, y) → (y, x)`, square canvases only;
 * - `antidiagonal`: top-right to bottom-left, `(x, y) → (N−1−y, N−1−x)`, square canvases only.
 * The active axes generate a group (order 1, 2, 4 or 8); a cell's orbit under it is every cell one action touches.
 */
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
  return symmetryOrbitKinds(cellIndex, width, height, axes, STITCH_WHOLE).map((cell) => cell.index);
}

/**
 * `symmetryOrbit` with the kind of stitch each copy holds when the cell at `cellIndex` holds `kind` (G-082): a mirror across the
 * vertical or horizontal axis, and a quarter turn, lay a "/" across as a "\" and back; a half turn and a mirror across a
 * diagonal do not. A whole stitch is a whole stitch everywhere.
 */
export function symmetryOrbitKinds(
  cellIndex: number,
  width: number,
  height: number,
  axes: SymmetryAxes,
  kind: number
): Array<{ index: number; kind: number }> {
  assertDimensions(width, height);
  assertCell(cellIndex, width, height);
  const u = 2 * (cellIndex % width) - (width - 1);
  const v = 2 * Math.floor(cellIndex / width) - (height - 1);
  const orbit: Array<{ index: number; kind: number }> = [];
  for (const matrix of symmetryGroup(effectiveSymmetryAxes(axes, width, height))) {
    const [a, b, c, d] = matrix;
    const x = (a * u + b * v + (width - 1)) / 2;
    const y = (c * u + d * v + (height - 1)) / 2;
    const index = y * width + x;
    if (!orbit.some((cell) => cell.index === index)) orbit.push({ index, kind: kindUnderMatrix(kind, matrix) });
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
  const kinds = pattern.cellKind ? new Uint8Array(cellPalette.length) : undefined;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sx = x;
      let sy = y;
      if (kind === "left-half" || kind === "upper-left-corner" || kind === "upper-left-half-corner") sx = Math.min(x, width - 1 - x);
      if (kind === "upper-half" || kind === "upper-left-corner" || kind === "upper-left-half-corner") sy = Math.min(y, height - 1 - y);
      // A copy reflected across exactly one of the two centre lines lies the other way; across both, or across the
      // diagonal, it does not (G-082).
      const swapped = (sx !== x) !== (sy !== y);
      if (kind === "upper-left-half-corner" && sx > sy) [sx, sy] = [sy, sx];
      cells[y * width + x] = cellPalette[sy * width + sx];
      if (kinds) {
        const source = pattern.cellKind![sy * width + sx];
        kinds[y * width + x] = swapped ? (source === 1 ? 2 : source === 2 ? 1 : source) : source;
      }
    }
  }
  return withCellPalette(pattern, cells, kinds);
}

/**
 * A quick mirror as one edit: a floating selection is merged first, vacating the place it was lifted from as
 * deselecting does, and the mirror is applied to that result, so the pair commits as a single undo step (G-037
 * criterion 5). The photo underlay is never mirrored.
 */
export function applyQuickMirrorWithSelection(
  pattern: StitchPattern,
  selection: FloatingSelection | null,
  kind: QuickMirror
): StitchPattern {
  return applyQuickMirror(selection ? mergeSelection(pattern, selection) : pattern, kind);
}

/**
 * How a fill finds its region and what it changes (G-115, D322). `sameKind`: a region is the touching stitches of the
 * seed's colour **and** its stitch type, so whole stitches do not spread into half ones of that colour. `colorOnly`: only the
 * colour changes, each stitch keeps its type, and the type is not asked when finding the region. The two are never both
 * on: a colour-only fill ignores type.
 */
export interface FillRule {
  sameKind?: boolean;
  colorOnly?: boolean;
}

/**
 * Fills the region of every cell in `cellIndex`'s orbit with `paletteIndex`: each region as it was before the fill,
 * 4-connected (drop-to-fill, or the Fill tool with Diagonal neighbours off) or 8-connected (the Fill tool), painted as one
 * union. On a pattern that isn't already symmetric the regions differ, so the result can be asymmetric (criterion 2).
 */
export function fillSymmetric(
  pattern: StitchPattern,
  cellIndex: number,
  axes: SymmetryAxes,
  paletteIndex: number,
  connectivity: 4 | 8,
  kind: number = STITCH_WHOLE,
  rule: FillRule = {}
): StitchPattern {
  assertPattern(pattern);
  const { width, height, cellPalette, palette } = pattern;
  assertCell(cellIndex, width, height);
  if (!Number.isInteger(paletteIndex) || (paletteIndex !== EMPTY_CELL && (paletteIndex < 0 || paletteIndex >= palette.length))) {
    throw new Error(`${paletteIndex} is neither a palette colour nor EMPTY.`);
  }
  if (connectivity !== 4 && connectivity !== 8) throw new Error(`Connectivity must be 4 or 8 (got ${connectivity}).`);
  const sameKind = rule.sameKind === true && rule.colorOnly !== true;

  const orbit = symmetryOrbitKinds(cellIndex, width, height, axes, kind);
  const cells = cellPalette.slice();
  const original = new Uint8Array(cells.length);
  if (pattern.cellKind) original.set(pattern.cellKind);
  const kinds = original.slice();
  // Floods over the original buffers sharing one visited mask: two seeds in one region traverse it once, and the region
  // takes the kind of the first seed in it; a cell reached from one seed can't belong to another seed's other region.
  const visited = new Uint8Array(cellPalette.length);
  const stack: number[] = [];
  for (const seed of orbit) {
    if (visited[seed.index]) continue;
    const value = cellPalette[seed.index];
    const seedKind = original[seed.index];
    visited[seed.index] = 1;
    stack.push(seed.index);
    while (stack.length > 0) {
      const cell = stack.pop()!;
      cells[cell] = paletteIndex;
      // An empty stitch is always whole (D258); colour only keeps each stitch's type, and an empty one stays whole.
      kinds[cell] = paletteIndex === EMPTY_CELL ? STITCH_WHOLE : rule.colorOnly ? original[cell] : seed.kind;
      const x = cell % width;
      const y = (cell - x) / width;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if ((dx === 0 && dy === 0) || nx < 0 || nx >= width) continue;
          if (connectivity === 4 && dx !== 0 && dy !== 0) continue;
          const neighbour = ny * width + nx;
          if (visited[neighbour] || cellPalette[neighbour] !== value) continue;
          if (sameKind && original[neighbour] !== seedKind) continue;
          visited[neighbour] = 1;
          stack.push(neighbour);
        }
      }
    }
  }
  return withCellPalette(pattern, cells, kinds);
}
