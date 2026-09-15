import { rgbToOklab } from "../color/color";
import { meanOklabAsRgb } from "../pipeline/quantize";
import { MAX_COLORS, type RGB } from "../types";

/**
 * Crisp+ palette refill (G-038 M5, D142). Snapping and pruning empty palette colours, and freed slots were left free, so
 * a photo could end well under the requested colour count. This splits the colour whose stitches vary most until the
 * count is reached. Stitches that snapping or pruning moved are ignored when choosing and fitting a split: their colours
 * are the blends those passes removed, and training on them would bring the blends back. They still follow their
 * colour's split, joining whichever half they are closer to.
 */

export interface PaletteRefillOptions {
  /** Usable cells a colour needs before it can be split. */
  minCellsToSplit: number;
  /** Mean squared OKLab spread a colour's usable cells need before a split is worth a slot. */
  minVariance: number;
  maxLloydIterations: number;
  /**
   * A new colour is refused when it sits on the line between two other palette colours: within this share of their
   * distance, at a position between them. That is what a blend looks like, and the Crisp+ passes just removed those.
   */
  maxMixResidual: number;
  /** Two palette colours must be at least this far apart in OKLab before they can rule a new colour a blend of them. */
  minMixSideDistance: number;
}

export const DEFAULT_PALETTE_REFILL_OPTIONS: PaletteRefillOptions = {
  minCellsToSplit: 12,
  minVariance: 0.0004,
  maxLloydIterations: 8,
  maxMixResidual: 0.25,
  minMixSideDistance: 0.1,
};

/** True when `colour` lies between two of `palette`'s colours, the shape of a blend (D142). */
function looksLikeBlend(colour: number[], palette: readonly RGB[], skip: number, options: PaletteRefillOptions): boolean {
  const labs = palette.map((c) => rgbToOklab(c));
  for (let a = 0; a < labs.length; a++) {
    if (a === skip) continue;
    for (let b = a + 1; b < labs.length; b++) {
      if (b === skip) continue;
      const A = labs[a];
      const B = labs[b];
      const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
      const length2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
      if (length2 < options.minMixSideDistance ** 2) continue;
      const ac = [colour[0] - A[0], colour[1] - A[1], colour[2] - A[2]];
      const t = (ab[0] * ac[0] + ab[1] * ac[1] + ab[2] * ac[2]) / length2;
      if (t <= 0.1 || t >= 0.9) continue;
      const perpendicular = Math.sqrt(((ac[0] - t * ab[0]) ** 2 + (ac[1] - t * ab[1]) ** 2 + (ac[2] - t * ab[2]) ** 2) / length2);
      if (perpendicular <= options.maxMixResidual) return true;
    }
  }
  return false;
}

export interface PaletteRefillResult {
  cellPaletteIndex: Uint8Array;
  palette: RGB[];
  /** Colours added, one per filled slot. */
  added: number;
}

interface Group {
  label: number;
  /** Cells of this label whose colour the passes didn't move. */
  usable: number[];
  /** Every cell of this label. */
  all: number[];
  totalError: number;
  variance: number;
}

function groupOf(label: number, labels: Uint8Array, excluded: Uint8Array, cellOklab: Float64Array): Group {
  const usable: number[] = [];
  const all: number[] = [];
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] !== label) continue;
    all.push(i);
    if (!excluded[i]) usable.push(i);
  }
  let meanL = 0;
  let meanA = 0;
  let meanB = 0;
  for (const i of usable) {
    meanL += cellOklab[i * 3];
    meanA += cellOklab[i * 3 + 1];
    meanB += cellOklab[i * 3 + 2];
  }
  const n = usable.length;
  if (n > 0) {
    meanL /= n;
    meanA /= n;
    meanB /= n;
  }
  let totalError = 0;
  for (const i of usable) {
    totalError += (cellOklab[i * 3] - meanL) ** 2 + (cellOklab[i * 3 + 1] - meanA) ** 2 + (cellOklab[i * 3 + 2] - meanB) ** 2;
  }
  return { label, usable, all, totalError, variance: n > 0 ? totalError / n : 0 };
}

/** Deterministic weighted-free 2-means over `cells`, seeded farthest-point, as in the Crisp evidence fit. */
function splitGroup(cells: number[], cellOklab: Float64Array, maxIterations: number): [number[], number[]] | null {
  if (cells.length < 2) return null;
  let meanL = 0;
  let meanA = 0;
  let meanB = 0;
  for (const i of cells) {
    meanL += cellOklab[i * 3];
    meanA += cellOklab[i * 3 + 1];
    meanB += cellOklab[i * 3 + 2];
  }
  meanL /= cells.length;
  meanA /= cells.length;
  meanB /= cells.length;

  const distance = (i: number, l: number, a: number, b: number) => (cellOklab[i * 3] - l) ** 2 + (cellOklab[i * 3 + 1] - a) ** 2 + (cellOklab[i * 3 + 2] - b) ** 2;
  let seed0 = cells[0];
  let best = -1;
  for (const i of cells) {
    const d = distance(i, meanL, meanA, meanB);
    if (d > best) {
      best = d;
      seed0 = i;
    }
  }
  let seed1 = cells[0];
  best = -1;
  for (const i of cells) {
    const d = distance(i, cellOklab[seed0 * 3], cellOklab[seed0 * 3 + 1], cellOklab[seed0 * 3 + 2]);
    if (d > best) {
      best = d;
      seed1 = i;
    }
  }
  let c0 = [cellOklab[seed0 * 3], cellOklab[seed0 * 3 + 1], cellOklab[seed0 * 3 + 2]];
  let c1 = [cellOklab[seed1 * 3], cellOklab[seed1 * 3 + 1], cellOklab[seed1 * 3 + 2]];
  let first: number[] = [];
  let second: number[] = [];
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    first = [];
    second = [];
    for (const i of cells) (distance(i, c0[0], c0[1], c0[2]) <= distance(i, c1[0], c1[1], c1[2]) ? first : second).push(i);
    if (first.length === 0 || second.length === 0) return null;
    const next = [first, second].map((group) => {
      let l = 0;
      let a = 0;
      let b = 0;
      for (const i of group) {
        l += cellOklab[i * 3];
        a += cellOklab[i * 3 + 1];
        b += cellOklab[i * 3 + 2];
      }
      return [l / group.length, a / group.length, b / group.length];
    });
    const settled = next[0].every((v, k) => v === c0[k]) && next[1].every((v, k) => v === c1[k]);
    c0 = next[0];
    c1 = next[1];
    if (settled) break;
  }
  return [first, second];
}

export function refillFreedSlots(
  labels: Uint8Array,
  palette: readonly RGB[],
  cellOklab: Float64Array,
  excluded: Uint8Array,
  targetColorCount: number,
  options: PaletteRefillOptions = DEFAULT_PALETTE_REFILL_OPTIONS
): PaletteRefillResult {
  if (excluded.length !== labels.length) throw new Error("refillFreedSlots: the excluded mask doesn't match the labels");
  const cellPaletteIndex = labels.slice();
  const nextPalette = [...palette];
  const used = new Set<number>();
  for (const label of cellPaletteIndex) if (label < nextPalette.length) used.add(label);
  let added = 0;

  const centre = (group: number[]) => {
    let l = 0;
    let a = 0;
    let b = 0;
    for (const i of group) {
      l += cellOklab[i * 3];
      a += cellOklab[i * 3 + 1];
      b += cellOklab[i * 3 + 2];
    }
    return [l / group.length, a / group.length, b / group.length];
  };

  const refused = new Set<number>();
  while (used.size + added < Math.min(targetColorCount, MAX_COLORS) && nextPalette.length < MAX_COLORS) {
    // Colours are tried from the most varied down, and one whose split would only produce a blend is set aside.
    const candidates: Group[] = [];
    for (const label of used) {
      if (refused.has(label)) continue;
      const group = groupOf(label, cellPaletteIndex, excluded, cellOklab);
      if (group.usable.length < options.minCellsToSplit || group.variance < options.minVariance) continue;
      candidates.push(group);
    }
    candidates.sort((a, b) => b.totalError - a.totalError);

    let bestGroup: Group | null = null;
    let split: [number[], number[]] | null = null;
    let c0: number[] = [];
    let c1: number[] = [];
    for (const group of candidates) {
      const attempt = splitGroup(group.usable, cellOklab, options.maxLloydIterations);
      if (!attempt) {
        refused.add(group.label);
        continue;
      }
      const centre0 = centre(attempt[0]);
      const centre1 = centre(attempt[1]);
      if (looksLikeBlend(centre0, nextPalette, group.label, options) || looksLikeBlend(centre1, nextPalette, group.label, options)) {
        refused.add(group.label);
        continue;
      }
      bestGroup = group;
      split = attempt;
      c0 = centre0;
      c1 = centre1;
      break;
    }
    if (!bestGroup || !split) break;
    const newLabel = nextPalette.length;
    // Only cells the passes left alone move to the new colour: a moved cell's own colour is still the blend those
    // passes removed, so letting it choose would train the new colour back into the transition.
    const secondCells: number[] = [];
    for (const i of bestGroup.usable) {
      const d0 = (cellOklab[i * 3] - c0[0]) ** 2 + (cellOklab[i * 3 + 1] - c0[1]) ** 2 + (cellOklab[i * 3 + 2] - c0[2]) ** 2;
      const d1 = (cellOklab[i * 3] - c1[0]) ** 2 + (cellOklab[i * 3 + 1] - c1[1]) ** 2 + (cellOklab[i * 3 + 2] - c1[2]) ** 2;
      if (d1 < d0) {
        cellPaletteIndex[i] = newLabel;
        secondCells.push(i);
      }
    }
    if (secondCells.length === 0 || secondCells.length === bestGroup.usable.length) {
      for (const i of secondCells) cellPaletteIndex[i] = bestGroup.label;
      break;
    }
    // Both halves take the colour of the untouched cells that carry them.
    const keptUsable = bestGroup.usable.filter((i) => cellPaletteIndex[i] === bestGroup.label);
    nextPalette[bestGroup.label] = meanOklabAsRgb(cellOklab, keptUsable);
    nextPalette.push(meanOklabAsRgb(cellOklab, secondCells));
    used.add(newLabel);
    added++;
  }

  return { cellPaletteIndex, palette: nextPalette, added };
}
