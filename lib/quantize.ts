import { linearToSrgb, oklabDistanceSquared, rgbToOklab, srgbToLinear, type Oklab } from "./color";
import { mergeSimilarColors } from "./palette-optimizer";
import { mulberry32 } from "./prng";
import { cellRgb, type CellColorBuffer, type RGB } from "./types";

export interface QuantizeResult {
  /** One palette index per cell, row-major, same length as the input grid. */
  cellPaletteIndex: Uint8Array;
  /** Representative RGB color for each palette entry, length k (or fewer if k > distinct colors). */
  palette: RGB[];
}

export interface ColorQuantizer {
  quantize(cells: CellColorBuffer, colorCount: number): QuantizeResult;
}

/** Mean of a cluster's member colors, averaged in linear light then re-encoded — see HANDOVER.md D7. */
export function meanRgbLinear(cells: CellColorBuffer, indices: number[]): RGB {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const i of indices) {
    const [cr, cg, cb] = cellRgb(cells, i);
    r += srgbToLinear(cr);
    g += srgbToLinear(cg);
    b += srgbToLinear(cb);
  }
  const n = indices.length || 1;
  return [linearToSrgb(r / n), linearToSrgb(g / n), linearToSrgb(b / n)];
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

/** Standard Lloyd's-algorithm refinement to convergence from a given set of initial centroids. */
function runLloyd(oklabColors: Oklab[], initialCentroids: Oklab[]): { centroids: Oklab[]; assignments: Uint8Array } {
  let centroids = initialCentroids;
  const assignments = new Uint8Array(oklabColors.length);

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    for (let i = 0; i < oklabColors.length; i++) {
      let best = 0;
      let bestDist = Infinity;
      for (let c = 0; c < centroids.length; c++) {
        const d = oklabDistanceSquared(oklabColors[i], centroids[c]);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      assignments[i] = best;
    }

    const sums = centroids.map(() => [0, 0, 0]);
    const counts = new Array(centroids.length).fill(0);
    for (let i = 0; i < oklabColors.length; i++) {
      const c = assignments[i];
      sums[c][0] += oklabColors[i][0];
      sums[c][1] += oklabColors[i][1];
      sums[c][2] += oklabColors[i][2];
      counts[c]++;
    }

    let maxShiftSq = 0;
    const newCentroids: Oklab[] = centroids.map((old, c) => {
      if (counts[c] === 0) return old;
      const next: Oklab = [sums[c][0] / counts[c], sums[c][1] / counts[c], sums[c][2] / counts[c]];
      maxShiftSq = Math.max(maxShiftSq, oklabDistanceSquared(old, next));
      return next;
    });
    centroids = newCentroids;
    if (maxShiftSq < CONVERGENCE_THRESHOLD_SQ) break;
  }

  return { centroids, assignments };
}

function buildPaletteFromAssignment(
  cells: CellColorBuffer,
  centroidCount: number,
  assignments: Uint8Array
): { cellPaletteIndex: Uint8Array; palette: RGB[] } {
  const indicesByCluster: number[][] = Array.from({ length: centroidCount }, () => []);
  for (let i = 0; i < assignments.length; i++) indicesByCluster[assignments[i]].push(i);

  const remap = new Int16Array(centroidCount).fill(-1);
  const palette: RGB[] = [];
  indicesByCluster.forEach((indices, c) => {
    if (indices.length === 0) return;
    remap[c] = palette.length;
    palette.push(meanRgbLinear(cells, indices));
  });

  const cellPaletteIndex = new Uint8Array(assignments.length);
  for (let i = 0; i < assignments.length; i++) cellPaletteIndex[i] = remap[assignments[i]];

  return { cellPaletteIndex, palette };
}

// Looser than palette-optimizer.ts's own DEFAULT_MERGE_DISTANCE_SQUARED
// (0.0004, tuned to catch only genuinely-tight near-duplicates for its own
// late-pipeline dedup role): this pass runs immediately after raw
// quantization, specifically looking for palette redundancy worth trading
// away for a real minority color the population-weighted k-means objective
// otherwise never allocates a slot to (HANDOVER.md D19/D20). Deliberately
// still much tighter than a "these look similar to a human" threshold --
// only merges colors close enough that losing the distinction barely
// changes reconstruction error, so genuinely different content (checked
// against the busy-multi-hue case in testing) isn't merged away.
const REINVEST_MERGE_THRESHOLD = 0.012;

/**
 * Redistributes palette budget freed by merging redundant colors to
 * whichever cell is currently the single worst-represented in the whole
 * image (largest reconstruction error to its own assigned color) --
 * repeated once per freed slot. This is the classic split/grow step from
 * LBG-style vector-quantization codebook design (Linde-Buzo-Gray 1980):
 * grow a codebook by always splitting off the currently-worst-served point,
 * not by density or geometry. Reconstruction error is a direct, real
 * measurement of "how badly does an actual color need help," unlike the
 * population/geometry proxies two earlier, reverted attempts relied on
 * (HANDOVER.md D18, D19) -- a genuinely rare, saturated color like a small
 * eye is, by construction, the worst-served point once the rest of the
 * palette has settled onto the dominant content, so it gets first claim on
 * any freed slot without needing to out-compete a majority region's
 * population anywhere in the process.
 */
function injectWorstFitClusters(oklabColors: Oklab[], assignment: Uint8Array, centroids: Oklab[], slotsToAdd: number) {
  const nextAssignment = assignment.slice();
  let nextCentroids = centroids.slice();

  for (let slot = 0; slot < slotsToAdd; slot++) {
    let worstIndex = 0;
    let worstDist = -1;
    for (let i = 0; i < oklabColors.length; i++) {
      const d = oklabDistanceSquared(oklabColors[i], nextCentroids[nextAssignment[i]]);
      if (d > worstDist) {
        worstDist = d;
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
 * K-means clustering in OKLab space (see HANDOVER.md D6 for why OKLab over
 * CIELAB+CIEDE2000). Squared Euclidean distance isn't a compromise here —
 * Lloyd's algorithm's centroid-update step is only valid under that exact
 * metric, and CIEDE2000 isn't even a metric (violates the triangle
 * inequality) — confirmed independently by the domain-expert review,
 * HANDOVER.md D7. Each cell has already been box-averaged (in linear light)
 * by `downsampleToGrid` before reaching here. The reported palette color is
 * the linear-light mean RGB of a cluster's members, not the OKLab centroid
 * converted back to RGB — avoids gamut round-trip artifacts and matches the
 * linear-light averaging rule used throughout (HANDOVER.md D7).
 *
 * After the ordinary single-stage k-means pass (unchanged from before
 * D18/D19/D20 — see those for two earlier, reverted attempts at the
 * underlying problem), checks whether any of the resulting colors are
 * redundant enough to merge (`REINVEST_MERGE_THRESHOLD`, looser than
 * `palette-optimizer.ts`'s own late-pipeline dedup threshold) and, if so,
 * reinvests each freed slot into whichever cell is currently worst-served
 * (`injectWorstFitClusters`), then re-converges. This only changes anything
 * when real redundancy is actually found — an image with no redundant
 * colors (verified in testing against a genuinely multi-hued fixture with
 * no dominant majority) takes the exact same path as before this change,
 * unlike the two earlier attempts, which altered every image's clustering
 * unconditionally regardless of whether it needed it.
 */
export const kMeansQuantizer: ColorQuantizer = {
  quantize(cells: CellColorBuffer, colorCount: number): QuantizeResult {
    const cellCount = cells.width * cells.height;
    const k = Math.max(1, Math.min(colorCount, cellCount));
    const oklabColors = new Array<Oklab>(cellCount);
    for (let i = 0; i < cellCount; i++) oklabColors[i] = rgbToOklab(cellRgb(cells, i));

    const rng = mulberry32(0xc0ffee ^ cellCount ^ k);

    const initialSeeds = kMeansPlusPlusSeeds(oklabColors, k, rng);
    const initial = runLloyd(oklabColors, initialSeeds);
    const initialResult = buildPaletteFromAssignment(cells, initial.centroids.length, initial.assignments);

    if (initialResult.palette.length < 3) {
      // Nothing meaningful to redistribute (k=1/2, or the image only has a
      // couple of real distinct colors) -- skip straight to the plain result.
      return initialResult;
    }

    const merged = mergeSimilarColors(initialResult.cellPaletteIndex, initialResult.palette, REINVEST_MERGE_THRESHOLD);
    const freedSlots = initialResult.palette.length - merged.palette.length;
    if (freedSlots <= 0) {
      return initialResult;
    }

    const mergedOklab = merged.palette.map(rgbToOklab);
    const injected = injectWorstFitClusters(oklabColors, merged.cellPaletteIndex, mergedOklab, freedSlots);
    const refined = runLloyd(oklabColors, injected.centroids);
    return buildPaletteFromAssignment(cells, refined.centroids.length, refined.assignments);
  },
};
