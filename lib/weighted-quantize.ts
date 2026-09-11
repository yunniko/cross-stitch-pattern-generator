import { oklabDistanceSquared, oklabToRgb, rgbToOklab, type Oklab } from "./color";
import { mergeSimilarColors } from "./palette-optimizer";
import { mulberry32 } from "./prng";
import { REINVEST_MERGE_THRESHOLD, WORST_FIT_IMPORTANCE_BOOST } from "./quantize";
import type { RGB } from "./types";

/**
 * G-024 M3 (HANDOVER.md D60): weighted k-means, generalizing `quantize.ts`'s
 * unweighted core so Crisp mode's palette training can see a confident
 * boundary cell's two real source-side colors instead of its single
 * manufactured average (design report Section 5: "Palette construction must
 * see the source-side colors").
 *
 * Kept as a separate module/interface from `ColorQuantizer` rather than a
 * modification to it (Codex critique, G-024 M3 planning) -- `quantize.ts`'s
 * `plainKMeansQuantizer`/`kMeansQuantizer` remain byte-for-byte the exact
 * "Standard" path, untouched. This module's natural output is one label per
 * SAMPLE, not one per grid cell, since a confident boundary cell contributes
 * two samples that may legitimately land on two different palette labels --
 * forcing that back into a one-label-per-cell shape would throw away exactly
 * the information M4's admissible-label-set construction needs.
 *
 * **Verified Standard-compatibility, not just claimed:** feeding this module
 * one weight-1 sample per cell (reproducing today's unweighted training
 * exactly) produces byte-identical output to `plainKMeansQuantizer` --
 * `weighted-quantize.spec.ts`'s dedicated equivalence tests confirm this
 * across several fixtures/colorCounts, not just "mathematically it should
 * reduce to the same thing" (a critique-flagged risk: the RNG consumption
 * pattern, not just the resulting math, has to match exactly for the
 * `mulberry32(0xc0ffee ^ n ^ k)` seed derivation to produce the same
 * sequence of draws).
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
 * Weighted k-means++ seeding. Both the first draw AND the subsequent
 * distance-weighted draws use `weight` as an observation-mass multiplier
 * (Codex critique, G-024 M3 planning: an earlier sketch of this design only
 * weighted the later draws, leaving the first seed's pick uniform over
 * records regardless of weight -- a real bias scikit-learn's own weighted
 * k-means++ avoids by weighting both). For the all-weight-1 case this
 * produces the EXACT same index for the EXACT same `rng()` draw as
 * `quantize.ts`'s unweighted `kMeansPlusPlusSeeds` (verified: for uniform
 * weight w=1, cumulative-threshold selection over `rng()*n` and
 * `Math.floor(rng()*n)` select the same index, consuming exactly one
 * `rng()` call per draw either way) -- the Standard-compatibility
 * invariant this module depends on.
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
 * Weighted Lloyd's-algorithm refinement: the centroid-update step becomes a
 * weighted mean (`sum(weight*color)/sum(weight)`), the correct generalization
 * for minimizing `sum_i weight_i * ||sample_i - centroid||^2` -- each mode
 * independently attracted to its own nearest centroid (Codex critique: this
 * is the crucial difference from Section 6's blend-scoring trap, which
 * scores ONE candidate against a WEIGHTED AVERAGE of both modes; training
 * instead lets each mode be its own point, free to pull a different
 * centroid). Carries forward the same trailing re-assignment invariant as
 * `quantize.ts`'s `runLloyd` (D42/G-022 M1): the returned `assignments` must
 * reflect the *final* converged centroids, not the previous iteration's.
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
  // Seeded by DISTINCT CELL COUNT, not raw sample-record count: splitting
  // one cell's evidence into two coverage-weighted records (vs. one) must
  // not perturb the RNG seed for every OTHER cell's own quantization run --
  // otherwise "does this cell need to be Crisp" would silently reshuffle
  // unrelated palette training elsewhere in the image. For the unweighted
  // one-sample-per-cell case this equals `samples.length` exactly, so it's
  // also exactly `quantize.ts`'s own `cellCount ^ k` seed -- the Standard-
  // compatibility invariant this module depends on (verified directly in
  // `weighted-quantize.spec.ts`).
  const distinctCellCount = new Set(samples.map((s) => s.cellIndex)).size;
  const rng = mulberry32(0xc0ffee ^ distinctCellCount ^ k);
  const seeds = weightedKMeansPlusPlusSeeds(samples, k, rng);
  const { centroids, assignments } = runWeightedLloyd(samples, seeds);
  return buildWeightedPalette(centroids, assignments, samples);
}

/**
 * Cell-first reinvestment (Codex critique, G-024 M3 planning): ranks and
 * splits by whichever grid CELL is currently worst-served overall --
 * `(1 + gamma*importance) * sum_of_that_cells_samples(weight * squaredError)`
 * -- then injects specifically the sample (mode) within that cell with the
 * largest `weight * squaredError` as the new centroid seed. This is a
 * deliberate choice among three defensible policies (see HANDOVER.md D60):
 * ranking by the worst INDIVIDUAL sample instead would let a tiny-coverage
 * sliver of a split cell win a slot on the strength of a large per-sample
 * error alone, even though its actual contribution to total error is small
 * -- "coverage blindness" the critique specifically flagged. Cell-first
 * preserves `quantize.ts`'s own established unit of priority (a whole grid
 * cell, per D18/D39's reinvestment-preserves-rare-content rationale) and
 * reduces EXACTLY to today's `injectWorstFitClusters` ranking when every
 * cell contributes exactly one weight-1 sample (single-sample cells: the
 * sum-over-samples collapses to that one sample's own error).
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
 * The weighted analogue of `quantize.ts`'s `kMeansQuantizer` ("Latest"):
 * plain weighted k-means, then merge redundant colors (`mergeSimilarColors`,
 * reusing the exact same `REINVEST_MERGE_THRESHOLD` -- one shared tuned
 * constant, not a second independently-chosen one), then reinvest each
 * freed slot via cell-first `weightedInjectWorstFitClusters`, then
 * re-converge. Reduces to exactly `kMeansQuantizer`'s own behavior when
 * `samples` is one weight-1 sample per cell (verified directly in
 * `weighted-quantize.spec.ts`, not assumed).
 *
 * `importance` (0-1 per grid cell; an all-zero function reproduces the
 * unweighted, importance-blind ranking exactly) mirrors `quantize.ts`'s own
 * `injectWorstFitClusters` parameter -- see that function's docstring for
 * the full rationale (D39/G-020 M3): it biases reinvestment toward cells the
 * rest of the pipeline already treats as real content, without letting
 * importance manufacture priority for an already-good fit.
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
