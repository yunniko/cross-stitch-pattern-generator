// Verbatim copy of lib/crisp/weighted-quantize.ts before G-035 M5 (commit 3085e6c), kept only as the reference for the M5 equivalence tests.
// Only import paths were changed to absolute aliases. Never edit it.
import { oklabDistanceSquared, oklabToRgb, rgbToOklab, type Oklab } from "@/lib/color/color";
import { mergeSimilarColors } from "@/lib/pipeline/palette-optimizer";
import { mulberry32 } from "@/lib/prng";
import { REINVEST_MERGE_THRESHOLD, WORST_FIT_IMPORTANCE_BOOST } from "@/lib/pipeline/quantize";
import type { RGB } from "@/lib/types";

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

/**
 * Weighted k-means++ seeding: the first draw and every later draw use `weight` as observation mass (weighting only the
 * later draws biases the first seed). With all weights 1 it picks the same index for the same `rng()` draw as the
 * unweighted seeding, one draw each -- the Standard-compatibility invariant.
 */
function weightedKMeansPlusPlusSeeds(samples: WeightedColorSample[], k: number, rng: () => number): Oklab[] {
  const totalWeight = samples.reduce((sum, s) => sum + s.weight, 0);

  let firstThreshold = rng() * totalWeight;
  let firstIndex = samples.length - 1;
  for (let i = 0; i < samples.length; i++) {
    firstThreshold -= samples[i].weight;
    if (firstThreshold <= 0) {
      firstIndex = i;
      break;
    }
  }
  const seeds: Oklab[] = [samples[firstIndex].oklab];
  const distSq = new Float64Array(samples.length).fill(Infinity);

  while (seeds.length < k) {
    let total = 0;
    for (let i = 0; i < samples.length; i++) {
      const d = oklabDistanceSquared(samples[i].oklab, seeds[seeds.length - 1]);
      if (d < distSq[i]) distSq[i] = d;
      total += distSq[i] * samples[i].weight;
    }
    if (total === 0) {
      // All remaining points coincide with an existing seed; pad with duplicates.
      // Not weighted (nothing to weight -- every candidate contributes 0),
      // matching the unweighted fallback's own uniform pick exactly.
      seeds.push(samples[Math.floor(rng() * samples.length)].oklab);
      continue;
    }
    let threshold = rng() * total;
    let chosen = samples.length - 1;
    for (let i = 0; i < samples.length; i++) {
      threshold -= distSq[i] * samples[i].weight;
      if (threshold <= 0) {
        chosen = i;
        break;
      }
    }
    seeds.push(samples[chosen].oklab);
  }
  return seeds;
}

/** Nearest-centroid assignment. Unaffected by weights: scaling every candidate distance for one sample by that sample's own (positive) weight cannot change which centroid is nearest. */
function assignToNearestCentroid(samples: WeightedColorSample[], centroids: Oklab[], out: Uint8Array): void {
  for (let i = 0; i < samples.length; i++) {
    let best = 0;
    let bestDist = Infinity;
    for (let c = 0; c < centroids.length; c++) {
      const d = oklabDistanceSquared(samples[i].oklab, centroids[c]);
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
 * re-assignment against the final centroids (D42).
 */
export function runWeightedLloyd(samples: WeightedColorSample[], initialCentroids: Oklab[]): { centroids: Oklab[]; assignments: Uint8Array } {
  let centroids = initialCentroids;
  const assignments = new Uint8Array(samples.length);

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    assignToNearestCentroid(samples, centroids, assignments);

    const sums = centroids.map(() => [0, 0, 0]);
    const weightSums = new Array(centroids.length).fill(0);
    for (let i = 0; i < samples.length; i++) {
      const c = assignments[i];
      sums[c][0] += samples[i].oklab[0] * samples[i].weight;
      sums[c][1] += samples[i].oklab[1] * samples[i].weight;
      sums[c][2] += samples[i].oklab[2] * samples[i].weight;
      weightSums[c] += samples[i].weight;
    }

    let maxShiftSq = 0;
    const newCentroids: Oklab[] = centroids.map((old, c) => {
      if (weightSums[c] === 0) return old;
      const next: Oklab = [sums[c][0] / weightSums[c], sums[c][1] / weightSums[c], sums[c][2] / weightSums[c]];
      maxShiftSq = Math.max(maxShiftSq, oklabDistanceSquared(old, next));
      return next;
    });
    centroids = newCentroids;
    if (maxShiftSq < CONVERGENCE_THRESHOLD_SQ) break;
  }

  assignToNearestCentroid(samples, centroids, assignments);
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

  // Group sample indices by cellIndex once; membership doesn't change
  // across injection rounds even though each sample's assigned CLUSTER
  // does.
  const samplesByCell = new Map<number, number[]>();
  samples.forEach((s, i) => {
    const list = samplesByCell.get(s.cellIndex);
    if (list) list.push(i);
    else samplesByCell.set(s.cellIndex, [i]);
  });

  for (let slot = 0; slot < slotsToAdd; slot++) {
    let worstCell = -1;
    let worstCellScore = -1;
    let worstSampleInCell = -1;

    for (const [cellIndex, sampleIndices] of samplesByCell) {
      let cellTotal = 0;
      let bestSampleIndex = sampleIndices[0];
      let bestSampleScore = -1;
      for (const i of sampleIndices) {
        const d = oklabDistanceSquared(samples[i].oklab, nextCentroids[nextAssignment[i]]);
        const weightedError = d * samples[i].weight;
        cellTotal += weightedError;
        if (weightedError > bestSampleScore) {
          bestSampleScore = weightedError;
          bestSampleIndex = i;
        }
      }
      const cellScore = cellTotal * (1 + importanceBoost * importance(cellIndex));
      if (cellScore > worstCellScore) {
        worstCellScore = cellScore;
        worstCell = cellIndex;
        worstSampleInCell = bestSampleIndex;
      }
    }

    if (worstCell === -1) break; // no samples at all -- nothing to inject

    const newCentroid = samples[worstSampleInCell].oklab;
    const newClusterIndex = nextCentroids.length;
    nextCentroids = [...nextCentroids, newCentroid];

    for (let i = 0; i < samples.length; i++) {
      const distToNew = oklabDistanceSquared(samples[i].oklab, newCentroid);
      const distToCurrent = oklabDistanceSquared(samples[i].oklab, nextCentroids[nextAssignment[i]]);
      if (distToNew < distToCurrent) nextAssignment[i] = newClusterIndex;
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
