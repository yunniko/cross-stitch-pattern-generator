import { oklabDistanceSquared, oklabToRgb, rgbToOklab, type Oklab } from "../color/color";
import { mergeSimilarColors } from "./palette-optimizer";
import { mulberry32 } from "../prng";
import { cellRgb, type CellColorBuffer, type RGB } from "../types";

export interface QuantizeResult {
  /** One palette index per cell, row-major. */
  cellPaletteIndex: Uint8Array;
  /** One RGB color per palette entry; fewer than k when the image has fewer distinct colors. */
  palette: RGB[];
}

export interface ColorQuantizer {
  /**
   * `importance` (0-1 per cell) is used only by reinvestment (`kMeansQuantizer`). `cellOklab` is an optional precomputed
   * interleaved conversion of `cells` (D106).
   */
  quantize(cells: CellColorBuffer, colorCount: number, importance?: Float32Array, cellOklab?: Float64Array): QuantizeResult;
}

/** `cells` as OKLab tuples, from a precomputed interleaved conversion when given; the same values `rgbToOklab` produces. */
function oklabTuples(cells: CellColorBuffer, cellOklab?: Float64Array): Oklab[] {
  const cellCount = cells.width * cells.height;
  const out = new Array<Oklab>(cellCount);
  if (cellOklab) {
    for (let i = 0; i < cellCount; i++) out[i] = [cellOklab[i * 3], cellOklab[i * 3 + 1], cellOklab[i * 3 + 2]];
  } else {
    for (let i = 0; i < cellCount; i++) out[i] = rgbToOklab(cellRgb(cells, i));
  }
  return out;
}

/** `meanRgbOklab` over an interleaved OKLab buffer instead of re-converting each member cell: identical summation order and result. */
export function meanOklabAsRgb(cellOklab: Float64Array, indices: number[]): RGB {
  let l = 0;
  let a = 0;
  let b = 0;
  for (const i of indices) {
    l += cellOklab[i * 3];
    a += cellOklab[i * 3 + 1];
    b += cellOklab[i * 3 + 2];
  }
  const n = indices.length || 1;
  return oklabToRgb([l / n, a / n, b / n]);
}

/**
 * The OKLab mean of the given cells, as RGB: the correct Lloyd centroid for the squared-OKLab objective every assignment
 * pass minimizes. A linear-RGB mean of the same members is a different, less accurate color (code review 2026-09-09,
 * finding 3). Spatial downsampling still averages in linear light, which is a different operation.
 */
export function meanRgbOklab(cells: CellColorBuffer, indices: number[]): RGB {
  let l = 0;
  let a = 0;
  let b = 0;
  for (const i of indices) {
    const [ol, oa, ob] = rgbToOklab(cellRgb(cells, i));
    l += ol;
    a += oa;
    b += ob;
  }
  const n = indices.length || 1;
  return oklabToRgb([l / n, a / n, b / n]);
}

/** Deterministic k-means++ seeding: spreads initial centroids apart instead of picking randomly. */
function kMeansPlusPlusSeeds(oklabColors: Oklab[], k: number, rng: () => number): Oklab[] {
  const seeds: Oklab[] = [oklabColors[Math.floor(rng() * oklabColors.length)]];
  const distSq = new Float64Array(oklabColors.length).fill(Infinity);

  while (seeds.length < k) {
    let total = 0;
    for (let i = 0; i < oklabColors.length; i++) {
      const d = oklabDistanceSquared(oklabColors[i], seeds[seeds.length - 1]);
      if (d < distSq[i]) distSq[i] = d;
      total += distSq[i];
    }
    if (total === 0) {
      // All remaining points coincide with an existing seed; pad with duplicates.
      seeds.push(oklabColors[Math.floor(rng() * oklabColors.length)]);
      continue;
    }
    let threshold = rng() * total;
    let chosen = 0;
    for (let i = 0; i < oklabColors.length; i++) {
      threshold -= distSq[i];
      if (threshold <= 0) {
        chosen = i;
        break;
      }
    }
    seeds.push(oklabColors[chosen]);
  }
  return seeds;
}

const MAX_ITERATIONS = 30;
const CONVERGENCE_THRESHOLD_SQ = 0.0001;

/** Nearest-centroid assignment for every interleaved point; first minimum wins, same arithmetic as `oklabDistanceSquared(point, centroid)`. */
function assignToNearestCentroid(points: Float64Array, centroids: Oklab[], flat: Float64Array, out: Uint8Array): void {
  const k = centroids.length;
  for (let c = 0; c < k; c++) {
    flat[c * 3] = centroids[c][0];
    flat[c * 3 + 1] = centroids[c][1];
    flat[c * 3 + 2] = centroids[c][2];
  }
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const o = i * 3;
    const pl = points[o];
    const pa = points[o + 1];
    const pb = points[o + 2];
    let best = 0;
    let bestDist = Infinity;
    for (let c = 0; c < k; c++) {
      const s = c * 3;
      const dl = pl - flat[s];
      const da = pa - flat[s + 1];
      const db = pb - flat[s + 2];
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
 * Lloyd refinement from the given centroids. The trailing assignment against the FINAL centroids is required; without
 * it the assignments reflect the previous iteration's centroids, which flattened contours (D42). Exported to test that
 * invariant against exact centroids, which the rounded public palette would obscure.
 */
export function runLloyd(oklabColors: Oklab[], initialCentroids: Oklab[]): { centroids: Oklab[]; assignments: Uint8Array } {
  // Interleaved typed buffers for the O(iterations × n × k) loops; same accumulation order, bit-identical (D107).
  const n = oklabColors.length;
  const points = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    points[i * 3] = oklabColors[i][0];
    points[i * 3 + 1] = oklabColors[i][1];
    points[i * 3 + 2] = oklabColors[i][2];
  }
  let centroids = initialCentroids;
  const k = centroids.length;
  const assignments = new Uint8Array(n);
  const flat = new Float64Array(k * 3);
  const sums = new Float64Array(k * 3);
  const counts = new Int32Array(k);

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    assignToNearestCentroid(points, centroids, flat, assignments);

    sums.fill(0);
    counts.fill(0);
    for (let i = 0; i < n; i++) {
      const s = assignments[i] * 3;
      sums[s] += points[i * 3];
      sums[s + 1] += points[i * 3 + 1];
      sums[s + 2] += points[i * 3 + 2];
      counts[assignments[i]]++;
    }

    let maxShiftSq = 0;
    const newCentroids: Oklab[] = centroids.map((old, c) => {
      if (counts[c] === 0) return old;
      const next: Oklab = [sums[c * 3] / counts[c], sums[c * 3 + 1] / counts[c], sums[c * 3 + 2] / counts[c]];
      maxShiftSq = Math.max(maxShiftSq, oklabDistanceSquared(old, next));
      return next;
    });
    centroids = newCentroids;
    if (maxShiftSq < CONVERGENCE_THRESHOLD_SQ) break;
  }

  assignToNearestCentroid(points, centroids, flat, assignments);
  return { centroids, assignments };
}

/** The RGB palette straight from the converged centroids, each already the OKLab mean of its members; empty clusters dropped. */
function buildPaletteFromAssignment(
  centroids: Oklab[],
  assignments: Uint8Array
): { cellPaletteIndex: Uint8Array; palette: RGB[] } {
  const counts = new Array(centroids.length).fill(0);
  for (const c of assignments) counts[c]++;

  const remap = new Int16Array(centroids.length).fill(-1);
  const palette: RGB[] = [];
  centroids.forEach((centroid, c) => {
    if (counts[c] === 0) return;
    remap[c] = palette.length;
    palette.push(oklabToRgb(centroid));
  });

  const cellPaletteIndex = new Uint8Array(assignments.length);
  for (let i = 0; i < assignments.length; i++) cellPaletteIndex[i] = remap[assignments[i]];

  return { cellPaletteIndex, palette };
}

// Looser than palette-optimizer's late-pipeline merge threshold: frees slots whose loss barely changes reconstruction
// error, for a minority color k-means never allocates (D19, D20). Shared with weighted-quantize.
export const REINVEST_MERGE_THRESHOLD = 0.012;

// A maximally important cell's reinvestment score doubles: enough to beat a moderately worse unimportant cell, never a
// much larger error. Shared with weighted-quantize.
export const WORST_FIT_IMPORTANCE_BOOST = 1.0;

/**
 * LBG-style codebook growth (Linde, Buzo and Gray 1980): each freed slot goes to the currently worst-represented cell,
 * so a rare saturated detail gets first claim once the palette has settled on the dominant content (D18-D20). The score
 * `distance · (1 + boost · importance)` lets importance amplify a real error but never create priority for a good fit
 * (D39). Exported to test the ranking directly on hand-chosen points.
 */
export function injectWorstFitClusters(
  oklabColors: Oklab[],
  assignment: Uint8Array,
  centroids: Oklab[],
  slotsToAdd: number,
  importance: Float32Array
) {
  const nextAssignment = assignment.slice();
  let nextCentroids = centroids.slice();

  for (let slot = 0; slot < slotsToAdd; slot++) {
    let worstIndex = 0;
    let worstScore = -1;
    for (let i = 0; i < oklabColors.length; i++) {
      const d = oklabDistanceSquared(oklabColors[i], nextCentroids[nextAssignment[i]]);
      const score = d * (1 + WORST_FIT_IMPORTANCE_BOOST * importance[i]);
      if (score > worstScore) {
        worstScore = score;
        worstIndex = i;
      }
    }

    const newCentroid = oklabColors[worstIndex];
    const newClusterIndex = nextCentroids.length;
    nextCentroids = [...nextCentroids, newCentroid];

    for (let i = 0; i < oklabColors.length; i++) {
      const distToNew = oklabDistanceSquared(oklabColors[i], newCentroid);
      const distToCurrent = oklabDistanceSquared(oklabColors[i], nextCentroids[nextAssignment[i]]);
      if (distToNew < distToCurrent) nextAssignment[i] = newClusterIndex;
    }
  }

  return { assignment: nextAssignment, centroids: nextCentroids };
}

/**
 * "Original" (D20): plain k-means in OKLab, where squared Euclidean distance is exactly what Lloyd's update minimizes
 * (CIEDE2000 isn't even a metric; D6, D7). Kept selectable: its population-driven palettes suit some images, though it
 * can miss a small distinct region at low color counts.
 */
export const plainKMeansQuantizer: ColorQuantizer = {
  quantize(cells: CellColorBuffer, colorCount: number, _importance?: Float32Array, cellOklab?: Float64Array): QuantizeResult {
    const cellCount = cells.width * cells.height;
    const k = Math.max(1, Math.min(colorCount, cellCount));
    const oklabColors = oklabTuples(cells, cellOklab);

    const rng = mulberry32(0xc0ffee ^ cellCount ^ k);
    const initialSeeds = kMeansPlusPlusSeeds(oklabColors, k, rng);
    const initial = runLloyd(oklabColors, initialSeeds);
    return buildPaletteFromAssignment(initial.centroids, initial.assignments);
  },
};

/**
 * "Latest", the default (D20): plain k-means, then merge redundant colors at `REINVEST_MERGE_THRESHOLD` and reinvest
 * every slot short of the requested count, whether merged away or lost to Lloyd attrition (D39), into the worst-served
 * cells, then re-converge. An image with no redundancy takes the plain path unchanged. It surfaces small distinct
 * regions sooner at a modest confetti cost on some noisy photos, so both modes stay selectable.
 */
export const kMeansQuantizer: ColorQuantizer = {
  quantize(cells: CellColorBuffer, colorCount: number, importance?: Float32Array, cellOklab?: Float64Array): QuantizeResult {
    const initialResult = plainKMeansQuantizer.quantize(cells, colorCount, undefined, cellOklab);
    const targetK = Math.min(colorCount, cells.width * cells.height);
    if (targetK < 3) {
      // Nothing meaningful to redistribute at k=1 or 2.
      return initialResult;
    }

    const merged = mergeSimilarColors(initialResult.cellPaletteIndex, initialResult.palette, REINVEST_MERGE_THRESHOLD);
    const freedSlots = Math.max(0, targetK - merged.palette.length);
    if (freedSlots <= 0) {
      return initialResult;
    }

    const cellCount = cells.width * cells.height;
    const oklabColors = oklabTuples(cells, cellOklab);
    const cellImportance = importance ?? new Float32Array(cellCount);

    const mergedOklab = merged.palette.map(rgbToOklab);
    const injected = injectWorstFitClusters(oklabColors, merged.cellPaletteIndex, mergedOklab, freedSlots, cellImportance);
    const refined = runLloyd(oklabColors, injected.centroids);
    return buildPaletteFromAssignment(refined.centroids, refined.assignments);
  },
};
