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

/**
 * `cells` as interleaved OKLab, `[L, a, b, L, a, b, ...]`: the precomputed conversion when given, else the values
 * `rgbToOklab` produces. The quantizers work on this buffer directly; a tuple per cell cost 2.7 M allocations at 2000
 * stitches, twice (G-047 M5).
 */
function oklabPoints(cells: CellColorBuffer, cellOklab?: Float64Array): Float64Array {
  if (cellOklab) return cellOklab;
  const cellCount = cells.width * cells.height;
  const out = new Float64Array(cellCount * 3);
  for (let i = 0; i < cellCount; i++) {
    const [l, a, b] = rgbToOklab(cellRgb(cells, i));
    out[i * 3] = l;
    out[i * 3 + 1] = a;
    out[i * 3 + 2] = b;
  }
  return out;
}

/** Tuples as an interleaved buffer, for the tuple-taking entry points kept for their tests. */
function flatten(oklabColors: Oklab[]): Float64Array {
  const points = new Float64Array(oklabColors.length * 3);
  for (let i = 0; i < oklabColors.length; i++) {
    points[i * 3] = oklabColors[i][0];
    points[i * 3 + 1] = oklabColors[i][1];
    points[i * 3 + 2] = oklabColors[i][2];
  }
  return points;
}

function pointAt(points: Float64Array, i: number): Oklab {
  return [points[i * 3], points[i * 3 + 1], points[i * 3 + 2]];
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
function kMeansPlusPlusSeeds(points: Float64Array, k: number, rng: () => number): Oklab[] {
  const n = points.length / 3;
  const seeds: Oklab[] = [pointAt(points, Math.floor(rng() * n))];
  const distSq = new Float64Array(n).fill(Infinity);

  while (seeds.length < k) {
    let total = 0;
    const [sl, sa, sb] = seeds[seeds.length - 1];
    for (let i = 0; i < n; i++) {
      // `oklabDistanceSquared(point, seed)`'s arithmetic, on the buffer.
      const dl = points[i * 3] - sl;
      const da = points[i * 3 + 1] - sa;
      const db = points[i * 3 + 2] - sb;
      const d = dl * dl + da * da + db * db;
      if (d < distSq[i]) distSq[i] = d;
      total += distSq[i];
    }
    if (total === 0) {
      // All remaining points coincide with an existing seed; pad with duplicates.
      seeds.push(pointAt(points, Math.floor(rng() * n)));
      continue;
    }
    let threshold = rng() * total;
    let chosen = 0;
    for (let i = 0; i < n; i++) {
      threshold -= distSq[i];
      if (threshold <= 0) {
        chosen = i;
        break;
      }
    }
    seeds.push(pointAt(points, chosen));
  }
  return seeds;
}

const MAX_ITERATIONS = 30;
const CONVERGENCE_THRESHOLD_SQ = 0.0001;

/**
 * A point keeps its centroid without a scan only when every other centroid is provably farther by more than this share
 * of the distance: far above the rounding in the bounds (a few ulps per iteration) and in any squared distance, so the
 * scan it skips would certainly have picked the same centroid (D177).
 */
const BOUND_MARGIN = 1e-9;

/**
 * Nearest centroid for point `i`, first minimum wins, with the same arithmetic as `oklabDistanceSquared(point,
 * centroid)`; also returns the second-smallest squared distance, for the bounds.
 */
function scanPoint(points: Float64Array, i: number, flat: Float64Array, k: number, out: { best: number; bestDist: number; secondDist: number }): void {
  const o = i * 3;
  const pl = points[o];
  const pa = points[o + 1];
  const pb = points[o + 2];
  let best = 0;
  let bestDist = Infinity;
  let secondDist = Infinity;
  for (let c = 0; c < k; c++) {
    const s = c * 3;
    const dl = pl - flat[s];
    const da = pa - flat[s + 1];
    const db = pb - flat[s + 2];
    const d = dl * dl + da * da + db * db;
    if (d < bestDist) {
      secondDist = bestDist;
      bestDist = d;
      best = c;
    } else if (d < secondDist) {
      secondDist = d;
    }
  }
  out.best = best;
  out.bestDist = bestDist;
  out.secondDist = secondDist;
}

/**
 * Lloyd refinement from the given centroids. The trailing assignment against the FINAL centroids is required; without
 * it the assignments reflect the previous iteration's centroids, which flattened contours (D42).
 *
 * Every assignment gives each point the centroid a full scan would (first minimum wins), but skips the scan where
 * Hamerly's bounds prove it (G-047 M5, D177): `upper` bounds the distance to the assigned centroid and `lower` the
 * distance to every other one, both moved by how far centroids moved. A point is scanned unless `upper` is below
 * `lower` by the margin, which also means no other centroid can tie. Sums still accumulate in point order, so centroids
 * and assignments are bit-identical to the scan-everything loop (D107).
 */
function runLloydOnPoints(points: Float64Array, initialCentroids: Oklab[]): { centroids: Oklab[]; assignments: Uint8Array } {
  const n = points.length / 3;
  let centroids = initialCentroids;
  const k = centroids.length;
  const assignments = new Uint8Array(n);
  const flat = new Float64Array(k * 3);
  const sums = new Float64Array(k * 3);
  const counts = new Int32Array(k);
  const upper = new Float64Array(n);
  const lower = new Float64Array(n);
  const moved = new Float64Array(k);
  // Half the distance from each centroid to its nearest other centroid: a point closer than that to its own centroid
  // has no nearer one (the triangle inequality), however far the bounds have decayed.
  const halfGap = new Float64Array(k);
  const scan = { best: 0, bestDist: 0, secondDist: 0 };

  const loadCentroids = () => {
    for (let c = 0; c < k; c++) {
      flat[c * 3] = centroids[c][0];
      flat[c * 3 + 1] = centroids[c][1];
      flat[c * 3 + 2] = centroids[c][2];
    }
    for (let c = 0; c < k; c++) {
      let nearest = Infinity;
      for (let o = 0; o < k; o++) {
        if (o === c) continue;
        const dl = flat[c * 3] - flat[o * 3];
        const da = flat[c * 3 + 1] - flat[o * 3 + 1];
        const db = flat[c * 3 + 2] - flat[o * 3 + 2];
        const d = dl * dl + da * da + db * db;
        if (d < nearest) nearest = d;
      }
      halfGap[c] = Math.sqrt(nearest) / 2;
    }
  };
  const scanAndBound = (i: number) => {
    scanPoint(points, i, flat, k, scan);
    assignments[i] = scan.best;
    upper[i] = Math.sqrt(scan.bestDist);
    lower[i] = Math.sqrt(scan.secondDist);
  };
  /** Assigns every point, scanning only where the bounds cannot prove the current centroid still nearest. */
  const assign = (first: boolean) => {
    loadCentroids();
    for (let i = 0; i < n; i++) {
      if (first) {
        scanAndBound(i);
        continue;
      }
      const a = assignments[i];
      // Every other centroid is at least `lower[i]` away, and at least `2·halfGap − upper` by the triangle inequality.
      const bound = Math.max(lower[i], halfGap[a]);
      if (upper[i] * (1 + BOUND_MARGIN) < bound * (1 - BOUND_MARGIN)) continue;
      // Tighten the upper bound to the exact distance and try once more before scanning.
      const s = a * 3;
      const dl = points[i * 3] - flat[s];
      const da = points[i * 3 + 1] - flat[s + 1];
      const db = points[i * 3 + 2] - flat[s + 2];
      upper[i] = Math.sqrt(dl * dl + da * da + db * db);
      if (upper[i] * (1 + BOUND_MARGIN) < bound * (1 - BOUND_MARGIN)) continue;
      scanAndBound(i);
    }
  };
  /** Moves every bound by how far the centroids moved from `previous` to `centroids`. */
  const moveBounds = (previous: Oklab[]) => {
    // The lower bound covers every centroid but the point's own, so it shrinks by the largest move among the others:
    // the largest overall, or the second largest for the points of the centroid that moved most.
    let farthest = 0;
    let farthestCentroid = -1;
    let secondFarthest = 0;
    for (let c = 0; c < k; c++) {
      moved[c] = previous[c] === centroids[c] ? 0 : Math.sqrt(oklabDistanceSquared(previous[c], centroids[c]));
      if (moved[c] > farthest) {
        secondFarthest = farthest;
        farthest = moved[c];
        farthestCentroid = c;
      } else if (moved[c] > secondFarthest) {
        secondFarthest = moved[c];
      }
    }
    for (let i = 0; i < n; i++) {
      const a = assignments[i];
      upper[i] += moved[a];
      lower[i] -= a === farthestCentroid ? secondFarthest : farthest;
    }
  };

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    assign(iter === 0);

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
    const previous = centroids;
    const newCentroids: Oklab[] = centroids.map((old, c) => {
      if (counts[c] === 0) return old;
      const next: Oklab = [sums[c * 3] / counts[c], sums[c * 3 + 1] / counts[c], sums[c * 3 + 2] / counts[c]];
      maxShiftSq = Math.max(maxShiftSq, oklabDistanceSquared(old, next));
      return next;
    });
    centroids = newCentroids;
    moveBounds(previous);
    if (maxShiftSq < CONVERGENCE_THRESHOLD_SQ) break;
  }

  assign(false);
  return { centroids, assignments };
}

/**
 * Lloyd refinement on tuples, for callers and tests that hold them; `runLloydOnPoints` on the same values. Exported to
 * test the trailing-assignment invariant (D42) against exact centroids, which the rounded public palette would obscure.
 */
export function runLloyd(oklabColors: Oklab[], initialCentroids: Oklab[]): { centroids: Oklab[]; assignments: Uint8Array } {
  return runLloydOnPoints(flatten(oklabColors), initialCentroids);
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
  return injectWorstFitClustersOnPoints(flatten(oklabColors), assignment, centroids, slotsToAdd, importance);
}

function injectWorstFitClustersOnPoints(points: Float64Array, assignment: Uint8Array, centroids: Oklab[], slotsToAdd: number, importance: Float32Array) {
  const nextAssignment = assignment.slice();
  let nextCentroids = centroids.slice();
  const n = points.length / 3;

  // G-035 M5: each point's distance to its assigned centroid is computed once from the supplied assignment and replaced
  // only when the point moves, with the same `oklabDistanceSquared` arithmetic, so every score and comparison sees the
  // identical double the per-slot recomputation produced (tests/unit/m5-equivalence.spec.ts).
  const assignedDist = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const c = nextCentroids[nextAssignment[i]];
    const dl = points[i * 3] - c[0];
    const da = points[i * 3 + 1] - c[1];
    const db = points[i * 3 + 2] - c[2];
    assignedDist[i] = dl * dl + da * da + db * db;
  }

  for (let slot = 0; slot < slotsToAdd; slot++) {
    let worstIndex = 0;
    let worstScore = -1;
    for (let i = 0; i < n; i++) {
      const score = assignedDist[i] * (1 + WORST_FIT_IMPORTANCE_BOOST * importance[i]);
      if (score > worstScore) {
        worstScore = score;
        worstIndex = i;
      }
    }

    const newCentroid = pointAt(points, worstIndex);
    const newClusterIndex = nextCentroids.length;
    nextCentroids = [...nextCentroids, newCentroid];
    const cl = newCentroid[0];
    const ca = newCentroid[1];
    const cb = newCentroid[2];

    for (let i = 0; i < n; i++) {
      const o = i * 3;
      const dl = points[o] - cl;
      const da = points[o + 1] - ca;
      const db = points[o + 2] - cb;
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
 * "Original" (D20): plain k-means in OKLab, where squared Euclidean distance is exactly what Lloyd's update minimizes
 * (CIEDE2000 isn't even a metric; D6, D7). Kept selectable: its population-driven palettes suit some images, though it
 * can miss a small distinct region at low color counts.
 */
export const plainKMeansQuantizer: ColorQuantizer = {
  quantize(cells: CellColorBuffer, colorCount: number, _importance?: Float32Array, cellOklab?: Float64Array): QuantizeResult {
    const cellCount = cells.width * cells.height;
    const k = Math.max(1, Math.min(colorCount, cellCount));
    const points = oklabPoints(cells, cellOklab);

    const rng = mulberry32(0xc0ffee ^ cellCount ^ k);
    const initialSeeds = kMeansPlusPlusSeeds(points, k, rng);
    const initial = runLloydOnPoints(points, initialSeeds);
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
    // Converted once and shared by both passes when no precomputed conversion was given.
    const points = oklabPoints(cells, cellOklab);
    const initialResult = plainKMeansQuantizer.quantize(cells, colorCount, undefined, points);
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
    const cellImportance = importance ?? new Float32Array(cellCount);

    const mergedOklab = merged.palette.map(rgbToOklab);
    const injected = injectWorstFitClustersOnPoints(points, merged.cellPaletteIndex, mergedOklab, freedSlots, cellImportance);
    const refined = runLloydOnPoints(points, injected.centroids);
    return buildPaletteFromAssignment(refined.centroids, refined.assignments);
  },
};
