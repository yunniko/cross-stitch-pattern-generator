import { oklabDistanceSquared, oklabToRgb, rgbToOklab, type Oklab } from "../color/color";
import { mergeSimilarColors } from "../pipeline/palette-optimizer";
import { mulberry32 } from "../prng";
import { REINVEST_MERGE_THRESHOLD, WORST_FIT_IMPORTANCE_BOOST } from "../pipeline/quantize";
import type { RGB } from "../types";

/**
 * Weighted k-means for Crisp mode (G-024, D60): palette training sees a confident boundary cell's two source-side
 * colors instead of its manufactured average. Separate from `ColorQuantizer` so the Standard path stays untouched, and
 * labels are per SAMPLE, since a crisp cell's two samples may land on different labels. With one weight-1 sample per
 * cell it is byte-identical to `quantize.ts`, RNG consumption included (weighted-quantize.spec.ts).
 */

export interface WeightedColorSample {
  oklab: Oklab;
  /**
   * Observation mass. An ordinary (non-boundary, or low-confidence) cell
   * contributes exactly one sample at weight 1, identical to today's
   * unweighted training. A confident boundary cell contributes its up-to-
   * two source-side mode colors instead of its averaged color, each
   * weighted by that mode's `coverage` (already normalized to sum to 1 by
   * `extractBoundaryEvidence`) -- so a split cell's total training weight
   * still sums to exactly 1, never double-counted (design report Section
   * 5's explicit requirement).
   */
  weight: number;
  /**
   * Which grid cell (row-major index) this sample came from. Ordinary
   * cells and a crisp cell's two mode-samples all share the same
   * `cellIndex` for their sample(s) -- used by cell-first reinvestment
   * (see `weightedInjectWorstFitClusters` below) to rank a CELL's combined
   * need, and by M4 to recover which label ended up supporting which cell.
   */
  cellIndex: number;
}

export interface WeightedQuantizeResult {
  /** Final RGB palette, one entry per surviving cluster (empty clusters dropped, same convention as `quantize.ts`). */
  palette: RGB[];
  /** One palette index per INPUT SAMPLE, same order/length as the input `WeightedColorSample[]`. */
  sampleLabelIndex: Uint8Array;
}

const MAX_ITERATIONS = 30;
const CONVERGENCE_THRESHOLD_SQ = 0.0001;

/** Parallel columns of a sample pool, read once so the hot loops never touch sample objects (G-035 M5). */
interface SampleColumns {
  n: number;
  L: Float64Array;
  A: Float64Array;
  B: Float64Array;
  W: Float64Array;
}

function sampleColumns(samples: WeightedColorSample[]): SampleColumns {
  const n = samples.length;
  const L = new Float64Array(n);
  const A = new Float64Array(n);
  const B = new Float64Array(n);
  const W = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    L[i] = s.oklab[0];
    A[i] = s.oklab[1];
    B[i] = s.oklab[2];
    W[i] = s.weight;
  }
  return { n, L, A, B, W };
}

/**
 * Weighted k-means++ seeding: the first draw and every later draw use `weight` as observation mass (weighting only the
 * later draws biases the first seed). With all weights 1 it picks the same index for the same `rng()` draw as the
 * unweighted seeding, one draw each -- the Standard-compatibility invariant. Totals are re-summed from scratch in sample
 * order each round, never updated incrementally, so rounding matches.
 */
function weightedKMeansPlusPlusSeeds(samples: WeightedColorSample[], k: number, rng: () => number): Oklab[] {
  const { n, L, A, B, W } = sampleColumns(samples);
  let totalWeight = 0;
  for (let i = 0; i < n; i++) totalWeight += W[i];

  let firstThreshold = rng() * totalWeight;
  let firstIndex = n - 1;
  for (let i = 0; i < n; i++) {
    firstThreshold -= W[i];
    if (firstThreshold <= 0) {
      firstIndex = i;
      break;
    }
  }
  const seeds: Oklab[] = [samples[firstIndex].oklab];
  const distSq = new Float64Array(n).fill(Infinity);

  while (seeds.length < k) {
    const last = seeds[seeds.length - 1];
    const sl = last[0];
    const sa = last[1];
    const sb = last[2];
    let total = 0;
    for (let i = 0; i < n; i++) {
      const dl = L[i] - sl;
      const da = A[i] - sa;
      const db = B[i] - sb;
      const d = dl * dl + da * da + db * db;
      if (d < distSq[i]) distSq[i] = d;
      total += distSq[i] * W[i];
    }
    if (total === 0) {
      // All remaining points coincide with an existing seed; pad with duplicates. Not weighted (nothing to weight --
      // every candidate contributes 0), matching the unweighted fallback's own uniform pick exactly.
      seeds.push(samples[Math.floor(rng() * n)].oklab);
      continue;
    }
    let threshold = rng() * total;
    let chosen = n - 1;
    for (let i = 0; i < n; i++) {
      threshold -= distSq[i] * W[i];
      if (threshold <= 0) {
        chosen = i;
        break;
      }
    }
    seeds.push(samples[chosen].oklab);
  }
  return seeds;
}

/** Nearest-centroid assignment, first minimum wins. Unaffected by weights: scaling every candidate distance for one sample by that sample's own (positive) weight cannot change which centroid is nearest. */
function assignToNearestCentroid(cols: SampleColumns, centroids: Oklab[], flat: Float64Array, out: Uint8Array): void {
  const k = centroids.length;
  for (let c = 0; c < k; c++) {
    flat[c * 3] = centroids[c][0];
    flat[c * 3 + 1] = centroids[c][1];
    flat[c * 3 + 2] = centroids[c][2];
  }
  const { n, L, A, B } = cols;
  for (let i = 0; i < n; i++) {
    const pl = L[i];
    const pa = A[i];
    const pb = B[i];
    let best = 0;
    let bestDist = Infinity;
    for (let c = 0; c < k; c++) {
      const o = c * 3;
      const dl = pl - flat[o];
      const da = pa - flat[o + 1];
      const db = pb - flat[o + 2];
      const d = dl * dl + da * da + db * db;
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    out[i] = best;
  }
}

/**
 * Weighted Lloyd refinement: the update is the weighted mean, which minimizes `Σ weight·‖sample − centroid‖²`, and each
 * mode is its own point free to pull a different centroid (unlike blend scoring). Keeps `runLloyd`'s trailing
 * re-assignment against the final centroids (D42). Sums accumulate in sample order on flat buffers (G-035 M5).
 */
export function runWeightedLloyd(samples: WeightedColorSample[], initialCentroids: Oklab[]): { centroids: Oklab[]; assignments: Uint8Array } {
  const cols = sampleColumns(samples);
  const { n, L, A, B, W } = cols;
  let centroids = initialCentroids;
  const k = centroids.length;
  const assignments = new Uint8Array(n);
  const flat = new Float64Array(k * 3);
  const sums = new Float64Array(k * 3);
  const weightSums = new Float64Array(k);

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    assignToNearestCentroid(cols, centroids, flat, assignments);

    sums.fill(0);
    weightSums.fill(0);
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      sums[c * 3] += L[i] * W[i];
      sums[c * 3 + 1] += A[i] * W[i];
      sums[c * 3 + 2] += B[i] * W[i];
      weightSums[c] += W[i];
    }

    let maxShiftSq = 0;
    const newCentroids: Oklab[] = centroids.map((old, c) => {
      if (weightSums[c] === 0) return old;
      const next: Oklab = [sums[c * 3] / weightSums[c], sums[c * 3 + 1] / weightSums[c], sums[c * 3 + 2] / weightSums[c]];
      maxShiftSq = Math.max(maxShiftSq, oklabDistanceSquared(old, next));
      return next;
    });
    centroids = newCentroids;
    if (maxShiftSq < CONVERGENCE_THRESHOLD_SQ) break;
  }

  assignToNearestCentroid(cols, centroids, flat, assignments);
  return { centroids, assignments };
}

function buildWeightedPalette(centroids: Oklab[], assignments: Uint8Array, samples: WeightedColorSample[]): WeightedQuantizeResult {
  const weightSums = new Array(centroids.length).fill(0);
  for (let i = 0; i < assignments.length; i++) weightSums[assignments[i]] += samples[i].weight;

  const remap = new Int16Array(centroids.length).fill(-1);
  const palette: RGB[] = [];
  centroids.forEach((centroid, c) => {
    if (weightSums[c] <= 0) return;
    remap[c] = palette.length;
    palette.push(oklabToRgb(centroid));
  });

  const sampleLabelIndex = new Uint8Array(assignments.length);
  for (let i = 0; i < assignments.length; i++) sampleLabelIndex[i] = remap[assignments[i]];

  return { palette, sampleLabelIndex };
}

/**
 * Plain weighted k-means over an explicit weighted sample pool -- the
 * weighted analogue of `quantize.ts`'s `plainKMeansQuantizer`. Callers
 * build `samples` themselves (M3 tests it directly with hand-built pools;
 * M4 will build it from real cells + confident `BoundaryEvidence`).
 */
export function weightedQuantize(samples: WeightedColorSample[], colorCount: number): WeightedQuantizeResult {
  const k = Math.max(1, Math.min(colorCount, samples.length));
  // Seeded by distinct CELL count, not sample count, so splitting one cell into two samples doesn't reshuffle training
  // everywhere else; with one sample per cell it equals quantize.ts's `cellCount ^ k` seed.
  const distinctCellCount = new Set(samples.map((s) => s.cellIndex)).size;
  const rng = mulberry32(0xc0ffee ^ distinctCellCount ^ k);
  const seeds = weightedKMeansPlusPlusSeeds(samples, k, rng);
  const { centroids, assignments } = runWeightedLloyd(samples, seeds);
  return buildWeightedPalette(centroids, assignments, samples);
}

/**
 * Cell-first reinvestment (D60): ranks cells by `(1 + boost·importance) · Σ weight·error` over their samples and seeds
 * the new centroid from that cell's worst sample. Ranking single samples instead would let a tiny-coverage sliver win a
 * slot on per-sample error alone. With one weight-1 sample per cell it reduces exactly to `injectWorstFitClusters`.
 */
export function weightedInjectWorstFitClusters(
  samples: WeightedColorSample[],
  assignment: Uint8Array,
  centroids: Oklab[],
  slotsToAdd: number,
  importance: (cellIndex: number) => number,
  importanceBoost: number
): { assignment: Uint8Array; centroids: Oklab[] } {
  const nextAssignment = assignment.slice();
  let nextCentroids = centroids.slice();
  const { n, L, A, B, W } = sampleColumns(samples);

  // Cells in first-occurrence order, each with its sample indices in ascending order, as flat arrays. Membership
  // doesn't change across injection rounds even though each sample's assigned cluster does.
  const groupOf = new Map<number, number>();
  const groupCells: number[] = [];
  const groupCounts: number[] = [];
  const sampleGroup = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const cellIndex = samples[i].cellIndex;
    let g = groupOf.get(cellIndex);
    if (g === undefined) {
      g = groupCells.length;
      groupOf.set(cellIndex, g);
      groupCells.push(cellIndex);
      groupCounts.push(0);
    }
    sampleGroup[i] = g;
    groupCounts[g]++;
  }
  const groupCount = groupCells.length;
  const groupStart = new Int32Array(groupCount + 1);
  for (let g = 0; g < groupCount; g++) groupStart[g + 1] = groupStart[g] + groupCounts[g];
  const groupSamples = new Int32Array(n);
  const fill = groupStart.slice(0, groupCount);
  for (let i = 0; i < n; i++) groupSamples[fill[sampleGroup[i]]++] = i;
  // `(1 + boost · importance)` per cell, the same double the ranking computed every round.
  const cellFactor = new Float64Array(groupCount);
  for (let g = 0; g < groupCount; g++) cellFactor[g] = 1 + importanceBoost * importance(groupCells[g]);

  // Each sample's distance to its assigned centroid, from the supplied assignment, replaced only when the sample moves
  // (G-035 M5); the arithmetic is `oklabDistanceSquared(sample, centroid)`'s.
  const assignedDist = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const c = nextCentroids[nextAssignment[i]];
    const dl = L[i] - c[0];
    const da = A[i] - c[1];
    const db = B[i] - c[2];
    assignedDist[i] = dl * dl + da * da + db * db;
  }

  for (let slot = 0; slot < slotsToAdd; slot++) {
    let worstCell = -1;
    let worstCellScore = -1;
    let worstSampleInCell = -1;

    for (let g = 0; g < groupCount; g++) {
      const start = groupStart[g];
      const end = groupStart[g + 1];
      let cellTotal = 0;
      let bestSampleIndex = groupSamples[start];
      let bestSampleScore = -1;
      for (let j = start; j < end; j++) {
        const i = groupSamples[j];
        const weightedError = assignedDist[i] * W[i];
        cellTotal += weightedError;
        if (weightedError > bestSampleScore) {
          bestSampleScore = weightedError;
          bestSampleIndex = i;
        }
      }
      const cellScore = cellTotal * cellFactor[g];
      if (cellScore > worstCellScore) {
        worstCellScore = cellScore;
        worstCell = groupCells[g];
        worstSampleInCell = bestSampleIndex;
      }
    }

    if (worstCell === -1) break; // no samples at all -- nothing to inject

    const newCentroid = samples[worstSampleInCell].oklab;
    const newClusterIndex = nextCentroids.length;
    nextCentroids = [...nextCentroids, newCentroid];
    const cl = newCentroid[0];
    const ca = newCentroid[1];
    const cb = newCentroid[2];

    for (let i = 0; i < n; i++) {
      const dl = L[i] - cl;
      const da = A[i] - ca;
      const db = B[i] - cb;
      const distToNew = dl * dl + da * da + db * db;
      if (distToNew < assignedDist[i]) {
        nextAssignment[i] = newClusterIndex;
        assignedDist[i] = distToNew;
      }
    }
  }

  return { assignment: nextAssignment, centroids: nextCentroids };
}

/**
 * The weighted "Latest": weighted k-means, merge at the shared `REINVEST_MERGE_THRESHOLD`, cell-first reinvestment of
 * freed slots, re-converge. `importance` works as in `injectWorstFitClusters` (D39). With one weight-1 sample per cell
 * it reproduces `kMeansQuantizer` exactly (weighted-quantize.spec.ts).
 */
export function weightedKMeansQuantize(
  samples: WeightedColorSample[],
  colorCount: number,
  importance: (cellIndex: number) => number = () => 0
): WeightedQuantizeResult {
  const initialResult = weightedQuantize(samples, colorCount);
  const distinctCells = new Set(samples.map((s) => s.cellIndex)).size;
  const targetK = Math.min(colorCount, distinctCells);
  if (targetK < 3) {
    return initialResult;
  }

  const sampleWeights = samples.map((s) => s.weight);
  const merged = mergeSimilarColors(initialResult.sampleLabelIndex, initialResult.palette, REINVEST_MERGE_THRESHOLD, sampleWeights);
  const freedSlots = Math.max(0, targetK - merged.palette.length);
  if (freedSlots <= 0) {
    return { palette: merged.palette, sampleLabelIndex: merged.cellPaletteIndex };
  }

  const mergedOklab = merged.palette.map(rgbToOklab);
  const injected = weightedInjectWorstFitClusters(samples, merged.cellPaletteIndex, mergedOklab, freedSlots, importance, WORST_FIT_IMPORTANCE_BOOST);
  const refined = runWeightedLloyd(samples, injected.centroids);
  return buildWeightedPalette(refined.centroids, refined.assignments, samples);
}
