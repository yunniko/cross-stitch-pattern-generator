import { oklabDistanceSquared, rgbToOklab } from "../color/color";
import type { PixelBuffer, RGB } from "../types";

/**
 * Crisp+ blend-label pruning (G-038 M3, D141): a greedy, label-level version of the label-cost idea. A palette colour is
 * removed when it only ever forms thin bands, its colour is a linear-light mix of two or three nearby region colours,
 * and the photo inside its cells shows a gradient between them (a blurred transition, not a flat real colour). Its
 * cells move to the constituent they are closest to by mixing weight. Freed slots stay free: refilling them by colour
 * error would recreate the blends.
 */

export interface BlendPruneOptions {
  /** A colour is a pruning candidate only when at most this share of its cells are surrounded by their own colour. */
  maxCandidateInteriorShare: number;
  /** A colour counts as a region, and can be a constituent, when at least this share of its cells are surrounded by it. */
  minRegionInteriorShare: number;
  /** Search radius, in cells, for the regions around a candidate's cells. */
  neighbourRadius: number;
  /** Share of a candidate's cells that must have a constituent within the radius. */
  minConstituentSupport: number;
  /** Smallest OKLab distance between two constituents. */
  minConstituentDistance: number;
  /** Largest residual of the mixing fit, as a share of the constituents' largest pairwise distance (linear RGB). */
  maxMixResidual: number;
  /** A cell is flat when the photo's mixing position inside it varies by less than this standard deviation. */
  minGradientStd: number;
  /** A colour with more than this share of flat cells is a real colour, not a transition, and is kept. */
  maxFlatShare: number;
  /** Rounds of pruning; stops early when a round removes nothing. */
  maxRounds: number;
}

export const DEFAULT_BLEND_PRUNE_OPTIONS: BlendPruneOptions = {
  maxCandidateInteriorShare: 0.2,
  minRegionInteriorShare: 0.3,
  neighbourRadius: 2,
  minConstituentSupport: 0.3,
  minConstituentDistance: 0.1,
  maxMixResidual: 0.2,
  minGradientStd: 0.1,
  maxFlatShare: 0.25,
  maxRounds: 3,
};

export interface BlendPruneResult {
  cellPaletteIndex: Uint8Array;
  /** Palette indices removed from use, in the order they were pruned. */
  pruned: number[];
}

const SRGB_TO_LINEAR = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const v = i / 255;
  SRGB_TO_LINEAR[i] = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}
const linearOf = (c: RGB): [number, number, number] => [SRGB_TO_LINEAR[c[0]], SRGB_TO_LINEAR[c[1]], SRGB_TO_LINEAR[c[2]]];

/** Most cells a candidate's photo gradient is sampled from. */
const MAX_GRADIENT_SAMPLE_CELLS = 400;

interface MixFit {
  constituents: number[];
  residual: number;
}

/** Least-squares mixing weights of `x` over `points` (2 or 3), constrained to sum to 1; returns weights and residual. */
function mixWeights(x: number[], points: number[][]): { weights: number[]; residual: number } {
  const p0 = points[0];
  const d = points.slice(1).map((p) => [p[0] - p0[0], p[1] - p0[1], p[2] - p0[2]]);
  const v = [x[0] - p0[0], x[1] - p0[1], x[2] - p0[2]];
  let coef: number[];
  if (d.length === 1) {
    const len2 = d[0][0] ** 2 + d[0][1] ** 2 + d[0][2] ** 2;
    coef = [len2 > 0 ? (d[0][0] * v[0] + d[0][1] * v[1] + d[0][2] * v[2]) / len2 : 0];
  } else {
    const a = d[0][0] ** 2 + d[0][1] ** 2 + d[0][2] ** 2;
    const b = d[0][0] * d[1][0] + d[0][1] * d[1][1] + d[0][2] * d[1][2];
    const c = d[1][0] ** 2 + d[1][1] ** 2 + d[1][2] ** 2;
    const e = d[0][0] * v[0] + d[0][1] * v[1] + d[0][2] * v[2];
    const f = d[1][0] * v[0] + d[1][1] * v[1] + d[1][2] * v[2];
    const det = a * c - b * b;
    coef = det !== 0 ? [(c * e - b * f) / det, (a * f - b * e) / det] : [0, 0];
  }
  const weights = [1 - coef.reduce((s, k) => s + k, 0), ...coef];
  let r2 = 0;
  for (let k = 0; k < 3; k++) {
    let fit = 0;
    for (let j = 0; j < points.length; j++) fit += weights[j] * points[j][k];
    r2 += (x[k] - fit) ** 2;
  }
  return { weights, residual: Math.sqrt(r2) };
}

export function pruneBlendLabels(
  labels: Uint8Array,
  gridWidth: number,
  gridHeight: number,
  palette: readonly RGB[],
  source: PixelBuffer,
  options: BlendPruneOptions = DEFAULT_BLEND_PRUNE_OPTIONS
): BlendPruneResult {
  if (labels.length !== gridWidth * gridHeight) throw new Error("pruneBlendLabels: labels don't match the grid size");
  const linear = palette.map(linearOf);
  const oklab = palette.map((c) => rgbToOklab(c));
  const minDistance2 = options.minConstituentDistance ** 2;
  const cellW = source.width / gridWidth;
  const cellH = source.height / gridHeight;
  const current = labels.slice();
  const pruned: number[] = [];

  for (let round = 0; round < options.maxRounds; round++) {
    const count = new Array<number>(palette.length).fill(0);
    const interior = new Array<number>(palette.length).fill(0);
    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        const v = current[y * gridWidth + x];
        if (v >= palette.length) continue;
        count[v]++;
        let same = 0;
        let seen = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            if ((dx || dy) && x + dx >= 0 && y + dy >= 0 && x + dx < gridWidth && y + dy < gridHeight) {
              seen++;
              if (current[(y + dy) * gridWidth + x + dx] === v) same++;
            }
          }
        if (seen > 0 && same >= seen - 1) interior[v]++;
      }
    }
    const interiorShare = count.map((n, i) => (n > 0 ? interior[i] / n : 0));
    const isRegion = interiorShare.map((s, i) => count[i] >= 9 && s >= options.minRegionInteriorShare);

    let prunedThisRound = 0;
    for (let label = 0; label < palette.length; label++) {
      if (count[label] === 0 || isRegion[label] || interiorShare[label] > options.maxCandidateInteriorShare) continue;

      // Regions near this colour's cells, by the share of its cells that have them within the radius.
      const support = new Map<number, number>();
      const cellsOfLabel: number[] = [];
      for (let i = 0; i < current.length; i++) {
        if (current[i] !== label) continue;
        cellsOfLabel.push(i);
        const x = i % gridWidth;
        const y = (i - x) / gridWidth;
        const near = new Set<number>();
        for (let dy = -options.neighbourRadius; dy <= options.neighbourRadius; dy++)
          for (let dx = -options.neighbourRadius; dx <= options.neighbourRadius; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= gridWidth || yy >= gridHeight) continue;
            const v = current[yy * gridWidth + xx];
            if (v < palette.length && v !== label && isRegion[v]) near.add(v);
          }
        for (const v of near) support.set(v, (support.get(v) ?? 0) + 1);
      }
      const constituents = [...support]
        .filter(([, n]) => n / cellsOfLabel.length >= options.minConstituentSupport)
        .sort((a, b) => b[1] - a[1] || a[0] - b[0])
        .slice(0, 3)
        .map(([v]) => v);
      if (constituents.length < 2) continue;

      // The best mixing explanation over pairs and the triple, with distinct constituents and non-negative weights.
      let best: MixFit | null = null;
      const sets: number[][] = [];
      for (let a = 0; a < constituents.length; a++) for (let b = a + 1; b < constituents.length; b++) sets.push([constituents[a], constituents[b]]);
      if (constituents.length === 3) sets.push(constituents);
      for (const set of sets) {
        let scale = 0;
        let distinct = true;
        for (let a = 0; a < set.length; a++)
          for (let b = a + 1; b < set.length; b++) {
            if (oklabDistanceSquared(oklab[set[a]], oklab[set[b]]) < minDistance2) distinct = false;
            const A = linear[set[a]];
            const B = linear[set[b]];
            scale = Math.max(scale, Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]));
          }
        if (!distinct || scale <= 0) continue;
        const { weights, residual } = mixWeights(linear[label], set.map((v) => linear[v]));
        if (weights.some((w) => w < -0.05)) continue;
        const normalized = residual / scale;
        if (normalized <= options.maxMixResidual && (!best || normalized < best.residual)) best = { constituents: set, residual: normalized };
      }
      if (!best) continue;

      // The photo inside this colour's cells must vary along the mix: the two constituents with the largest weight set the axis.
      const { weights } = mixWeights(linear[label], best.constituents.map((v) => linear[v]));
      const order = best.constituents.map((v, k) => ({ v, w: weights[k] })).sort((p, q) => q.w - p.w);
      const A = linear[order[0].v];
      const B = linear[order[1].v];
      const ab = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
      const len2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
      if (len2 <= 0) continue;
      // A real line is flat inside the cells that lie wholly on it, even when cells straddling its edges ramp; a blurred
      // transition ramps inside nearly every cell. So count flat cells rather than averaging the variation.
      let flatCells = 0;
      let sampled = 0;
      const stride = Math.max(1, Math.floor(cellsOfLabel.length / MAX_GRADIENT_SAMPLE_CELLS));
      for (let k = 0; k < cellsOfLabel.length; k += stride) {
        const i = cellsOfLabel[k];
        const cx = i % gridWidth;
        const cy = (i - cx) / gridWidth;
        const x0 = Math.max(0, Math.round(cx * cellW));
        const x1 = Math.min(source.width, Math.round((cx + 1) * cellW));
        const y0 = Math.max(0, Math.round(cy * cellH));
        const y1 = Math.min(source.height, Math.round((cy + 1) * cellH));
        let n = 0;
        let sum = 0;
        let sumSq = 0;
        for (let y = y0; y < y1; y++)
          for (let x = x0; x < x1; x++) {
            const o = (y * source.width + x) * 4;
            if (source.data[o + 3] === 0) continue;
            const t = ((SRGB_TO_LINEAR[source.data[o]] - A[0]) * ab[0] + (SRGB_TO_LINEAR[source.data[o + 1]] - A[1]) * ab[1] + (SRGB_TO_LINEAR[source.data[o + 2]] - A[2]) * ab[2]) / len2;
            n++;
            sum += t;
            sumSq += t * t;
          }
        if (n < 2) continue;
        if (Math.sqrt(Math.max(0, sumSq / n - (sum / n) ** 2)) < options.minGradientStd) flatCells++;
        sampled++;
      }
      if (sampled === 0 || flatCells / sampled > options.maxFlatShare) continue;

      // Each cell joins the constituent its own photo colour mixes most of.
      for (const i of cellsOfLabel) {
        const cx = i % gridWidth;
        const cy = (i - cx) / gridWidth;
        const x0 = Math.max(0, Math.round(cx * cellW));
        const x1 = Math.min(source.width, Math.round((cx + 1) * cellW));
        const y0 = Math.max(0, Math.round(cy * cellH));
        const y1 = Math.min(source.height, Math.round((cy + 1) * cellH));
        const mean = [0, 0, 0];
        let n = 0;
        for (let y = y0; y < y1; y++)
          for (let x = x0; x < x1; x++) {
            const o = (y * source.width + x) * 4;
            if (source.data[o + 3] === 0) continue;
            mean[0] += SRGB_TO_LINEAR[source.data[o]];
            mean[1] += SRGB_TO_LINEAR[source.data[o + 1]];
            mean[2] += SRGB_TO_LINEAR[source.data[o + 2]];
            n++;
          }
        const cellColour = n > 0 ? mean.map((m) => m / n) : linear[label];
        const w = mixWeights(cellColour, best.constituents.map((v) => linear[v])).weights;
        let target = 0;
        for (let k = 1; k < w.length; k++) if (w[k] > w[target]) target = k;
        current[i] = best.constituents[target];
      }
      pruned.push(label);
      prunedThisRound++;
    }
    if (prunedThisRound === 0) break;
  }
  return { cellPaletteIndex: current, pruned };
}
