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
 *
 * The work happens on a `WeightedSamplePool` of parallel columns (G-047 M4, D176): a 2000-stitch Crisp chart has 2.7 M
 * samples, and one object per sample cost seconds of allocation and collection. The `WeightedColorSample[]` functions
 * remain, as wrappers that build a pool, with the same results.
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

/** A sample pool as parallel columns: sample `i` is `(L[i], A[i], B[i])` at weight `W[i]` from grid cell `cell[i]`. */
export interface WeightedSamplePool {
  n: number;
  L: Float64Array;
  A: Float64Array;
  B: Float64Array;
  W: Float64Array;
  /** Non-negative cell indices. */
  cell: Int32Array;
}

export interface WeightedQuantizeResult {
  /** Final RGB palette, one entry per surviving cluster (empty clusters dropped, same convention as `quantize.ts`). */
  palette: RGB[];
  /** One palette index per INPUT SAMPLE, same order/length as the input `WeightedColorSample[]`. */
  sampleLabelIndex: Uint8Array;
}

const MAX_ITERATIONS = 30;
const CONVERGENCE_THRESHOLD_SQ = 0.0001;

/** A pool of `n` samples, to be filled by the caller. */
export function emptySamplePool(n: number): WeightedSamplePool {
  return { n, L: new Float64Array(n), A: new Float64Array(n), B: new Float64Array(n), W: new Float64Array(n), cell: new Int32Array(n) };
}

/** The pool holding exactly these samples, in order. */
export function samplePoolOf(samples: WeightedColorSample[]): WeightedSamplePool {
  const pool = emptySamplePool(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    pool.L[i] = s.oklab[0];
    pool.A[i] = s.oklab[1];
    pool.B[i] = s.oklab[2];
    pool.W[i] = s.weight;
    pool.cell[i] = s.cellIndex;
  }
  return pool;
}

function sampleAt(pool: WeightedSamplePool, i: number): Oklab {
  return [pool.L[i], pool.A[i], pool.B[i]];
}

/**
 * Each sample's cell as a dense group number, groups in order of first appearance; the count of groups is the number of
 * distinct cells. A typed lookup when the indices are compact, as a grid's are; a map for anything else.
 */
function groupCells(pool: WeightedSamplePool): { groupOfSample: Int32Array; groupCells: number[] } {
  const { n, cell } = pool;
  let maxCell = -1;
  for (let i = 0; i < n; i++) if (cell[i] > maxCell) maxCell = cell[i];
  const groupOfSample = new Int32Array(n);
  const groupCellList: number[] = [];
  if (maxCell < 4 * n + 1024) {
    const groupOfCell = new Int32Array(maxCell + 1).fill(-1);
    for (let i = 0; i < n; i++) {
      let g = groupOfCell[cell[i]];
      if (g === -1) {
        g = groupCellList.length;
        groupOfCell[cell[i]] = g;
        groupCellList.push(cell[i]);
      }
      groupOfSample[i] = g;
    }
  } else {
    const groupOf = new Map<number, number>();
    for (let i = 0; i < n; i++) {
      let g = groupOf.get(cell[i]);
      if (g === undefined) {
        g = groupCellList.length;
        groupOf.set(cell[i], g);
        groupCellList.push(cell[i]);
      }
      groupOfSample[i] = g;
    }
  }
  return { groupOfSample, groupCells: groupCellList };
}

/**
 * Weighted k-means++ seeding: the first draw and every later draw use `weight` as observation mass (weighting only the
 * later draws biases the first seed). With all weights 1 it picks the same index for the same `rng()` draw as the
 * unweighted seeding, one draw each -- the Standard-compatibility invariant. Totals are re-summed from scratch in sample
 * order each round, never updated incrementally, so rounding matches.
 */
function weightedKMeansPlusPlusSeeds(pool: WeightedSamplePool, k: number, rng: () => number): Oklab[] {
  const { n, L, A, B, W } = pool;
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
  const seeds: Oklab[] = [sampleAt(pool, firstIndex)];
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
      seeds.push(sampleAt(pool, Math.floor(rng() * n)));
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
    seeds.push(sampleAt(pool, chosen));
  }
  return seeds;
}

/** Nearest-centroid assignment, first minimum wins. Unaffected by weights: scaling every candidate distance for one sample by that sample's own (positive) weight cannot change which centroid is nearest. */
function assignToNearestCentroid(pool: WeightedSamplePool, centroids: Oklab[], flat: Float64Array, out: Uint8Array): void {
  const k = centroids.length;
  for (let c = 0; c < k; c++) {
    flat[c * 3] = centroids[c][0];
    flat[c * 3 + 1] = centroids[c][1];
    flat[c * 3 + 2] = centroids[c][2];
  }
  const { n, L, A, B } = pool;
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
export function runWeightedLloydPool(pool: WeightedSamplePool, initialCentroids: Oklab[]): { centroids: Oklab[]; assignments: Uint8Array } {
  const { n, L, A, B, W } = pool;
  let centroids = initialCentroids;
  const k = centroids.length;
  const assignments = new Uint8Array(n);
  const flat = new Float64Array(k * 3);
  const sums = new Float64Array(k * 3);
  const weightSums = new Float64Array(k);

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    assignToNearestCentroid(pool, centroids, flat, assignments);

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

  assignToNearestCentroid(pool, centroids, flat, assignments);
  return { centroids, assignments };
}

export function runWeightedLloyd(
  samples: WeightedColorSample[],
  initialCentroids: Oklab[]
): { centroids: Oklab[]; assignments: Uint8Array } {
  return runWeightedLloydPool(samplePoolOf(samples), initialCentroids);
}

function buildWeightedPalette(centroids: Oklab[], assignments: Uint8Array, pool: WeightedSamplePool): WeightedQuantizeResult {
  const weightSums = new Array(centroids.length).fill(0);
  for (let i = 0; i < assignments.length; i++) weightSums[assignments[i]] += pool.W[i];

  /**
   * A cluster with no weight has no colour to contribute, so it is dropped; its samples are the zero-coverage modes of
   * confident cells, whose labels nothing reads — a crisp cell takes its label from `buildAdmissibleLabelCosts`, and
   * every non-crisp cell has a weight-1 sample that can never be dropped. They are labelled 0 to say so out loud
   * (G-051): the value used to come from `-1` stored into a `Uint8Array` and resolved through an undefined lookup in
   * `mergeSimilarColors`, which happened to reach the same 0 and broke the moment that lookup was tightened.
   */
  const DROPPED_CLUSTER_LABEL = 0;
  const remap = new Int16Array(centroids.length).fill(DROPPED_CLUSTER_LABEL);
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
 * Plain weighted k-means over an explicit weighted sample pool -- the weighted analogue of `quantize.ts`'s
 * `plainKMeansQuantizer`.
 */
export function weightedQuantizePool(
  pool: WeightedSamplePool,
  colorCount: number,
  distinctCells = groupCells(pool).groupCells.length
): WeightedQuantizeResult {
  const k = Math.max(1, Math.min(colorCount, pool.n));
  // Seeded by distinct CELL count, not sample count, so splitting one cell into two samples doesn't reshuffle training
  // everywhere else; with one sample per cell it equals quantize.ts's `cellCount ^ k` seed.
  const rng = mulberry32(0xc0ffee ^ distinctCells ^ k);
  const seeds = weightedKMeansPlusPlusSeeds(pool, k, rng);
  const { centroids, assignments } = runWeightedLloydPool(pool, seeds);
  return buildWeightedPalette(centroids, assignments, pool);
}

export function weightedQuantize(samples: WeightedColorSample[], colorCount: number): WeightedQuantizeResult {
  return weightedQuantizePool(samplePoolOf(samples), colorCount);
}

/**
 * Cell-first reinvestment (D60): ranks cells by `(1 + boost·importance) · Σ weight·error` over their samples and seeds
 * the new centroid from that cell's worst sample. Ranking single samples instead would let a tiny-coverage sliver win a
 * slot on per-sample error alone. With one weight-1 sample per cell it reduces exactly to `injectWorstFitClusters`.
 */
export function weightedInjectWorstFitClustersPool(
  pool: WeightedSamplePool,
  assignment: Uint8Array,
  centroids: Oklab[],
  slotsToAdd: number,
  importance: (cellIndex: number) => number,
  importanceBoost: number,
  groups: { groupOfSample: Int32Array; groupCells: number[] } = groupCells(pool)
): { assignment: Uint8Array; centroids: Oklab[] } {
  const nextAssignment = assignment.slice();
  let nextCentroids = centroids.slice();
  const { n, L, A, B, W } = pool;

  // Cells in first-occurrence order, each with its sample indices in ascending order, as flat arrays. Membership
  // doesn't change across injection rounds even though each sample's assigned cluster does.
  const { groupOfSample, groupCells: cellOfGroup } = groups;
  const groupCount = cellOfGroup.length;
  const groupStart = new Int32Array(groupCount + 1);
  for (let i = 0; i < n; i++) groupStart[groupOfSample[i] + 1]++;
  for (let g = 0; g < groupCount; g++) groupStart[g + 1] += groupStart[g];
  const groupSamples = new Int32Array(n);
  const fill = groupStart.slice(0, groupCount);
  for (let i = 0; i < n; i++) groupSamples[fill[groupOfSample[i]]++] = i;
  // `(1 + boost · importance)` per cell, the same double the ranking computed every round.
  const cellFactor = new Float64Array(groupCount);
  for (let g = 0; g < groupCount; g++) cellFactor[g] = 1 + importanceBoost * importance(cellOfGroup[g]);

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
        worstCell = cellOfGroup[g];
        worstSampleInCell = bestSampleIndex;
      }
    }

    if (worstCell === -1) break; // no samples at all -- nothing to inject

    const newCentroid = sampleAt(pool, worstSampleInCell);
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

export function weightedInjectWorstFitClusters(
  samples: WeightedColorSample[],
  assignment: Uint8Array,
  centroids: Oklab[],
  slotsToAdd: number,
  importance: (cellIndex: number) => number,
  importanceBoost: number
): { assignment: Uint8Array; centroids: Oklab[] } {
  return weightedInjectWorstFitClustersPool(samplePoolOf(samples), assignment, centroids, slotsToAdd, importance, importanceBoost);
}

/**
 * The weighted "Latest": weighted k-means, merge at the shared `REINVEST_MERGE_THRESHOLD`, cell-first reinvestment of
 * freed slots, re-converge. `importance` works as in `injectWorstFitClusters` (D39). With one weight-1 sample per cell
 * it reproduces `kMeansQuantizer` exactly (weighted-quantize.spec.ts).
 */
export function weightedKMeansQuantizePool(
  pool: WeightedSamplePool,
  colorCount: number,
  importance: (cellIndex: number) => number = () => 0
): WeightedQuantizeResult {
  // Grouping cells is the same for every step, so it is done once rather than per step.
  const groups = groupCells(pool);
  const distinctCells = groups.groupCells.length;
  const initialResult = weightedQuantizePool(pool, colorCount, distinctCells);
  const targetK = Math.min(colorCount, distinctCells);
  if (targetK < 3) {
    return initialResult;
  }

  const merged = mergeSimilarColors(initialResult.sampleLabelIndex, initialResult.palette, REINVEST_MERGE_THRESHOLD, pool.W);
  const freedSlots = Math.max(0, targetK - merged.palette.length);
  if (freedSlots <= 0) {
    return { palette: merged.palette, sampleLabelIndex: merged.cellPaletteIndex };
  }

  const mergedOklab = merged.palette.map(rgbToOklab);
  const injected = weightedInjectWorstFitClustersPool(
    pool,
    merged.cellPaletteIndex,
    mergedOklab,
    freedSlots,
    importance,
    WORST_FIT_IMPORTANCE_BOOST,
    groups
  );
  const refined = runWeightedLloydPool(pool, injected.centroids);
  return buildWeightedPalette(refined.centroids, refined.assignments, pool);
}

export function weightedKMeansQuantize(
  samples: WeightedColorSample[],
  colorCount: number,
  importance: (cellIndex: number) => number = () => 0
): WeightedQuantizeResult {
  return weightedKMeansQuantizePool(samplePoolOf(samples), colorCount, importance);
}
