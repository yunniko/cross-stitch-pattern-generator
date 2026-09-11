import { oklabDistanceSquared, oklabToRgb, rgbToOklab, type Oklab } from "./color";
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

/**
 * Mean of a cluster's member colors *in OKLab space*, converted back to RGB
 * (with gamut clamping via `oklabToRgb`) -- the correct Lloyd-update
 * centroid for the squared-OKLab-distance objective assignment and ICM/
 * contour-cleanup optimization actually use throughout this pipeline.
 *
 * A linear-RGB mean (this function's predecessor, `meanRgbLinear`) does NOT
 * minimize squared OKLab error for a given membership -- a mean only
 * minimizes squared error in the coordinate system it's computed in, and
 * linear RGB isn't that system here. A domain-expert review (HANDOVER.md
 * D11) had flagged the *need* to recompute post-optimization, but the
 * recompute itself still used a linear-RGB mean, leaving the same
 * inconsistency; the code-review that caught this (2026-09-09, finding 3)
 * reproduced it directly: on a 100x60 grayscale ramp through the default
 * two-color pipeline, recomputing the same final memberships in OKLab
 * reduced mean squared OKLab error by ~6.9% without moving a single stitch,
 * and on a simple 50/50 black/white cluster the reduction was ~26% (0.337 ->
 * 0.250). Linear-light averaging remains the correct approach for the
 * *spatial downsample* (`downsampleToGrid`) -- that's a genuinely different
 * operation (reconstructing what a printed cell's average appearance would
 * be) from *this* one (finding the representative color that best serves the
 * clustering objective already in effect).
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

/**
 * Builds the final RGB palette straight from `runLloyd`'s own converged
 * OKLab centroids -- each one already *is* the exact OKLab mean of the
 * cells assigned to it (that's what makes a centroid step a real Lloyd
 * update), so converting it to RGB (via `oklabToRgb`, gamut-clamped) is the
 * correct representative color, not a second, differently-computed mean
 * over the same membership (code-review 2026-09-09, finding 3).
 */
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
 * Plain single-stage k-means in OKLab space (see HANDOVER.md D6 for why
 * OKLab over CIELAB+CIEDE2000). Squared Euclidean distance isn't a
 * compromise here — Lloyd's algorithm's centroid-update step is only valid
 * under that exact metric, and CIEDE2000 isn't even a metric (violates the
 * triangle inequality) — confirmed independently by the domain-expert
 * review, HANDOVER.md D7. Each cell has already been box-averaged (in
 * linear light) by `downsampleToGrid` before reaching here. The reported
 * palette color is `buildPaletteFromAssignment`'s direct `oklabToRgb`
 * conversion of each converged centroid — the correct Lloyd-update
 * centroid for the squared-OKLab objective this quantizer actually
 * minimizes (see `meanRgbOklab`'s docstring above for why a linear-RGB
 * mean would be a different, less accurate color for that same
 * membership). `buildPattern` in `lib/pattern.ts` recomputes this again
 * from each color's *final* post-optimization membership before a chart
 * is rendered, since ICM/contour-cleanup reassign cells after this
 * function returns — this quantizer's own returned palette is only ever
 * final as-is when called directly (e.g. with `optimize: false`, or from
 * a test) rather than through the normal `buildPattern` pipeline.
 *
 * This is "Original" in the app's generation-mode switch (HANDOVER.md D20):
 * exactly the algorithm this project shipped with, before D18/D19/D20's
 * investigation into small-region color loss. Kept available on purpose,
 * not just as a fallback — it has a real, opposite trade-off from
 * `kMeansQuantizer` below (simpler, more population-driven palettes; can
 * miss a small distinct region at low color counts) that some source
 * images and preferences suit better.
 */
export const plainKMeansQuantizer: ColorQuantizer = {
  quantize(cells: CellColorBuffer, colorCount: number): QuantizeResult {
    const cellCount = cells.width * cells.height;
    const k = Math.max(1, Math.min(colorCount, cellCount));
    const oklabColors = new Array<Oklab>(cellCount);
    for (let i = 0; i < cellCount; i++) oklabColors[i] = rgbToOklab(cellRgb(cells, i));

    const rng = mulberry32(0xc0ffee ^ cellCount ^ k);
    const initialSeeds = kMeansPlusPlusSeeds(oklabColors, k, rng);
    const initial = runLloyd(oklabColors, initialSeeds);
    return buildPaletteFromAssignment(initial.centroids, initial.assignments);
  },
};

/**
 * "Latest" in the app's generation-mode switch (HANDOVER.md D20, the
 * default): runs `plainKMeansQuantizer` first, then checks whether any of
 * the resulting colors are redundant enough to merge
 * (`REINVEST_MERGE_THRESHOLD`, looser than `palette-optimizer.ts`'s own
 * late-pipeline dedup threshold) and, if so, reinvests each freed slot into
 * whichever cell is currently worst-served (`injectWorstFitClusters`), then
 * re-converges. This only changes anything when real redundancy is
 * actually found — an image with no redundant colors (verified in testing
 * against a genuinely multi-hued fixture with no dominant majority) takes
 * the exact same path as the plain quantizer above, unlike two earlier,
 * reverted attempts at this same underlying problem (HANDOVER.md D18/D19),
 * which altered every image's clustering unconditionally regardless of
 * whether it needed it. Real trade-off, not a strict improvement: measured
 * confetti/complexity on some ordinary noisy photos rises modestly (still
 * within the project's own regression-suite tolerance bands) in exchange
 * for reliably surfacing a small, real, perceptually-distinct region much
 * sooner — which is exactly why both modes stay selectable rather than one
 * replacing the other outright.
 *
 * `freedSlots` also recovers plain, ordinary Lloyd's-algorithm attrition
 * (a k-means++ seed's Voronoi region going empty during refinement), not
 * just slots `mergeSimilarColors` frees from genuine redundancy (2026-09-11
 * review, HANDOVER.md D39/G-020 M2) -- comparing the merged survivor count
 * against `targetK` (the actual requested/clamped color budget) rather
 * than against `initialResult`'s own count means a color lost to bad-luck
 * seeding gets the same reinvestment chance as one lost to a real
 * redundancy merge, using the exact same, already-proven mechanism. This
 * is provably safe against the "genuinely fewer distinct colors than k"
 * case the collapse behavior above is *supposed* to produce (see
 * `quantize.spec.ts`'s "collapses to the number of distinct colors... never
 * producing empty entries" test): when every cell already sits exactly on
 * its own centroid (zero reconstruction error everywhere, because there's
 * truly nothing left to split), any speculative injected cluster attracts
 * no cells away from its neighbor and comes back empty from `runLloyd`'s
 * own reconvergence pass, so `buildPaletteFromAssignment` drops it again --
 * the same self-correcting property that already makes `injectWorstFitClusters`
 * safe to call unconditionally in the merge-triggered case below. Confirmed
 * against a reproducible real-world case found by brute-force search over
 * random distinct-color fixtures (25 cells / 13 distinct colors, k=5):
 * before this fix, both `plainKMeansQuantizer` and `kMeansQuantizer`
 * silently returned only 4 colors; after, `kMeansQuantizer` recovers the
 * full 5 requested (`quantize.spec.ts`'s attrition-recovery test).
 */
export const kMeansQuantizer: ColorQuantizer = {
  quantize(cells: CellColorBuffer, colorCount: number): QuantizeResult {
    const initialResult = plainKMeansQuantizer.quantize(cells, colorCount);
    const targetK = Math.min(colorCount, cells.width * cells.height);
    if (targetK < 3) {
      // Nothing meaningful to redistribute (k=1/2, or the image only has a
      // couple of real distinct colors) -- skip straight to the plain result.
      return initialResult;
    }

    const merged = mergeSimilarColors(initialResult.cellPaletteIndex, initialResult.palette, REINVEST_MERGE_THRESHOLD);
    const freedSlots = Math.max(0, targetK - merged.palette.length);
    if (freedSlots <= 0) {
      return initialResult;
    }

    const cellCount = cells.width * cells.height;
    const oklabColors = new Array<Oklab>(cellCount);
    for (let i = 0; i < cellCount; i++) oklabColors[i] = rgbToOklab(cellRgb(cells, i));

    const mergedOklab = merged.palette.map(rgbToOklab);
    const injected = injectWorstFitClusters(oklabColors, merged.cellPaletteIndex, mergedOklab, freedSlots);
    const refined = runLloyd(oklabColors, injected.centroids);
    return buildPaletteFromAssignment(refined.centroids, refined.assignments);
  },
};
