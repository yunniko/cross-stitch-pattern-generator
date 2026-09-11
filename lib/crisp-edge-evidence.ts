import { oklabDistanceSquared, rgbToOklab, type Oklab } from "./color";
import type { PixelBuffer } from "./types";

/**
 * G-024 M2 (HANDOVER.md D57/D58): the source-side boundary-evidence
 * extractor -- a standalone prototype, NOT wired into `buildPattern` yet
 * (that's M4's job, once M3's weighted-palette-training side exists too).
 * Implements the design report's Section 3 (data representation) and
 * Section 4 (conservative hard-boundary detection): for each cell, fit a
 * deterministic two-color ("mode") description from a small SOURCE
 * neighborhood around it (not just the cell's own footprint -- "neighboring
 * source context helps estimate the two region colors when the boundary
 * crosses near a cell edge," Section 4), then decide, via an explicit
 * confidence score, whether that neighborhood shows a genuine two-region
 * hard boundary rather than a smooth gradient or noise.
 *
 * **Not yet the report's own bounded-typed-array storage layout.** This
 * prototype returns one object per queried cell for testability and
 * calibration; M4's actual pipeline wiring will need the compact,
 * allocation-free storage the report calls for ("bounded typed-array
 * storage... source samples can be processed and discarded"). Isolating
 * the algorithm from its eventual storage layout first, and validating it
 * broadly, is deliberate -- consistent with this project's own D18
 * lesson (an attractive-looking mechanism validated on one example alone
 * has repeatedly turned out to need real correction once tested broadly).
 */

export interface BoundaryEvidence {
  /** Up to 2 representative source colors for this cell's local neighborhood, in OKLab. Length 1 when no genuine second mode was found. */
  modes: Oklab[];
  /** Coverage fraction of each mode, WITHIN THE CELL'S OWN footprint (not the wider sampling neighborhood), summing to ~1. Same order/length as `modes`. */
  coverage: number[];
  /** Within-mode spread (mean squared OKLab distance to that mode's own centroid) over the full sampling neighborhood -- large for a mode that isn't actually a compact color group (e.g. one half of a smooth gradient). */
  spread: number[];
  /** How far apart the two modes' weighted source-position centroids are, in neighborhood-normalized [0,1] coordinates -- large for a genuine spatial split, small when the two color groups are spatially interleaved (texture/noise). 0 when only one mode was found. */
  spatialSeparation: number;
  /** Combined [0,1] confidence that this cell's neighborhood shows a genuine two-region hard boundary. 0 when only one mode was found. */
  confidence: number;
}

export interface BoundaryEvidenceOptions {
  /** How far to expand the sampling neighborhood beyond the cell's own footprint, as a fraction of the cell's own width/height. The report's own "small source neighborhood" -- not the whole image. */
  neighborhoodMargin: number;
  /** Minimum squared-OKLab distance between the two fitted modes to even consider them distinct -- guards against calling ordinary sampling/anti-aliasing noise within one true region a "boundary." ~1 JND, matching contour-cleanup.ts's own `costCeiling` convention. */
  minModeSeparation: number;
  maxLloydIterations: number;
}

export const DEFAULT_BOUNDARY_EVIDENCE_OPTIONS: BoundaryEvidenceOptions = {
  neighborhoodMargin: 0.75,
  minModeSeparation: 0.02,
  maxLloydIterations: 6,
};

interface WeightedSample {
  oklab: Oklab;
  weight: number;
  /** Position within the (expanded) sampling neighborhood, normalized to [0,1] on each axis. */
  nx: number;
  ny: number;
  /**
   * This pixel's alpha-weighted overlap with the CELL's own (unexpanded)
   * footprint specifically -- used for `coverage`, not for fitting the
   * modes themselves (that uses `weight`, the overlap with the wider
   * neighborhood). Computed independently of `weight`, not derived from it:
   * a pixel that straddles the cell/neighborhood boundary has a real
   * partial overlap with each box separately (the neighborhood box always
   * contains the cell box, so `cellWeight <= weight`, but the two are
   * otherwise unrelated fractions -- see the corrected-bug note on
   * `collectWeightedSamples` for why a binary "is the center inside the
   * cell" test does not recover this fraction).
   */
  cellWeight: number;
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

/**
 * Collects alpha-weighted, fractional-coverage-weighted source samples for
 * a cell's expanded neighborhood, using the *exact same* per-pixel weight
 * formula as `downsampleToGrid` (the report's own explicit instruction --
 * Section 3: "Use the same exact fractional source footprints and alpha
 * weighting as `downsampleToGrid`"). Verified directly against `lib/
 * downsample.ts`'s own inner loop, not assumed to match from memory.
 *
 * **Bug found and fixed during G-024 M3 planning (HANDOVER.md D59, via a
 * Codex design critique that read this file directly rather than trusting
 * it from the M2 summary):** `cellWeight` must be each pixel's own
 * fractional overlap with the CELL's bounds specifically, computed the
 * same way `weight` is computed against the neighborhood's bounds -- NOT
 * a binary "does this pixel's CENTER fall inside the cell" test gating the
 * neighborhood-relative `weight` (the original, buggy version). That
 * binary version silently corrupted `coverage` for any pixel straddling a
 * cell boundary -- i.e. for the exact boundary cells this whole module
 * exists to describe correctly -- by either dropping a real partial
 * overlap to zero (center just outside) or inflating it to the pixel's
 * full neighborhood-relative weight (center just inside), rather than the
 * true fractional cell-overlap in between. Reproduced directly before
 * fixing: a 5-pixel-wide source (black at x<2) downsampled to 2 columns
 * has a true 80%/20% black/white coverage split for cell 0 (its footprint
 * is source x in [0, 2.5), so the white pixel at [2,3) contributes exactly
 * half its weight) -- the buggy version returned 100%/0% because that
 * pixel's center (x=2.5) landed exactly on the cell boundary and failed
 * the binary test, discarding its real partial contribution entirely.
 */
function collectWeightedSamples(
  source: PixelBuffer,
  gridWidth: number,
  gridHeight: number,
  cellX: number,
  cellY: number,
  neighborhoodMargin: number
): WeightedSample[] {
  const { width: srcW, height: srcH, data } = source;

  const cellXStart = (cellX * srcW) / gridWidth;
  const cellXEnd = ((cellX + 1) * srcW) / gridWidth;
  const cellYStart = (cellY * srcH) / gridHeight;
  const cellYEnd = ((cellY + 1) * srcH) / gridHeight;
  const cellW = cellXEnd - cellXStart;
  const cellH = cellYEnd - cellYStart;

  const nbXStart = Math.max(0, cellXStart - cellW * neighborhoodMargin);
  const nbXEnd = Math.min(srcW, cellXEnd + cellW * neighborhoodMargin);
  const nbYStart = Math.max(0, cellYStart - cellH * neighborhoodMargin);
  const nbYEnd = Math.min(srcH, cellYEnd + cellH * neighborhoodMargin);

  const xFirst = Math.max(0, Math.floor(nbXStart));
  const xLast = Math.min(srcW - 1, Math.ceil(nbXEnd) - 1);
  const yFirst = Math.max(0, Math.floor(nbYStart));
  const yLast = Math.min(srcH - 1, Math.ceil(nbYEnd) - 1);

  const samples: WeightedSample[] = [];
  const nbW = nbXEnd - nbXStart || 1;
  const nbH = nbYEnd - nbYStart || 1;

  for (let y = yFirst; y <= yLast; y++) {
    const yWeight = overlap(y, y + 1, nbYStart, nbYEnd);
    if (yWeight <= 0) continue;
    const yCellWeight = overlap(y, y + 1, cellYStart, cellYEnd);
    for (let x = xFirst; x <= xLast; x++) {
      const xWeight = overlap(x, x + 1, nbXStart, nbXEnd);
      if (xWeight <= 0) continue;
      const pixelIndex = (y * srcW + x) * 4;
      const alpha = data[pixelIndex + 3] / 255;
      const weight = xWeight * yWeight * alpha;
      if (weight <= 0) continue;

      const xCellWeight = overlap(x, x + 1, cellXStart, cellXEnd);
      // Independent fractional overlap with the CELL's own bounds -- see
      // the doc comment above this function for why this must NOT be
      // derived from `weight` (the neighborhood-relative value) via a
      // binary center test.
      const cellWeight = Math.max(0, xCellWeight) * Math.max(0, yCellWeight) * alpha;

      const oklab = rgbToOklab([data[pixelIndex], data[pixelIndex + 1], data[pixelIndex + 2]]);
      const px = x + 0.5;
      const py = y + 0.5;
      samples.push({
        oklab,
        weight,
        nx: (px - nbXStart) / nbW,
        ny: (py - nbYStart) / nbH,
        cellWeight,
      });
    }
  }
  return samples;
}

/**
 * Weighted 2-means (farthest-point initialization for determinism -- no
 * random seeding, matching this project's general preference for
 * reproducible algorithms). Returns the two centroids and a same-length
 * assignment array (0 or 1) into `samples`. With fewer than 2 samples,
 * returns a degenerate single-cluster result.
 */
function fitTwoModes(samples: WeightedSample[], maxIterations: number): { centroids: Oklab[]; assignment: Uint8Array } {
  if (samples.length === 0) return { centroids: [[0, 0, 0]], assignment: new Uint8Array(0) };
  if (samples.length === 1) return { centroids: [samples[0].oklab], assignment: new Uint8Array(1) };

  // Farthest-point seeding: first seed is the sample farthest from the
  // weighted mean (breaks ties deterministically by iteration order);
  // second seed is the sample farthest from the first.
  let meanL = 0;
  let meanA = 0;
  let meanB = 0;
  let totalWeight = 0;
  for (const s of samples) {
    meanL += s.oklab[0] * s.weight;
    meanA += s.oklab[1] * s.weight;
    meanB += s.oklab[2] * s.weight;
    totalWeight += s.weight;
  }
  const mean: Oklab = totalWeight > 0 ? [meanL / totalWeight, meanA / totalWeight, meanB / totalWeight] : samples[0].oklab;

  let seed0 = 0;
  let bestDist = -1;
  samples.forEach((s, i) => {
    const d = oklabDistanceSquared(s.oklab, mean);
    if (d > bestDist) {
      bestDist = d;
      seed0 = i;
    }
  });
  let seed1 = 0;
  bestDist = -1;
  samples.forEach((s, i) => {
    const d = oklabDistanceSquared(s.oklab, samples[seed0].oklab);
    if (d > bestDist) {
      bestDist = d;
      seed1 = i;
    }
  });

  let centroids: Oklab[] = [samples[seed0].oklab, samples[seed1].oklab];
  const assignment = new Uint8Array(samples.length);

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;
    for (let i = 0; i < samples.length; i++) {
      const d0 = oklabDistanceSquared(samples[i].oklab, centroids[0]);
      const d1 = oklabDistanceSquared(samples[i].oklab, centroids[1]);
      const label = d1 < d0 ? 1 : 0;
      if (assignment[i] !== label) {
        assignment[i] = label;
        changed = true;
      }
    }

    const sums: [number, number, number][] = [
      [0, 0, 0],
      [0, 0, 0],
    ];
    const weights = [0, 0];
    for (let i = 0; i < samples.length; i++) {
      const label = assignment[i];
      sums[label][0] += samples[i].oklab[0] * samples[i].weight;
      sums[label][1] += samples[i].oklab[1] * samples[i].weight;
      sums[label][2] += samples[i].oklab[2] * samples[i].weight;
      weights[label] += samples[i].weight;
    }
    centroids = [0, 1].map((k): Oklab => (weights[k] > 0 ? [sums[k][0] / weights[k], sums[k][1] / weights[k], sums[k][2] / weights[k]] : centroids[k]));

    if (!changed) break;
  }

  return { centroids, assignment };
}

/**
 * The main entry point: fits a two-mode description for one cell's
 * neighborhood and scores confidence that it represents a genuine hard
 * boundary, per the report's own Section 4 requirements -- color
 * separation, spatial organization, and (implicitly, via within-mode
 * spread) rejecting a smooth gradient's own two-cluster split.
 */
export function extractBoundaryEvidence(
  source: PixelBuffer,
  gridWidth: number,
  gridHeight: number,
  cellX: number,
  cellY: number,
  options: BoundaryEvidenceOptions = DEFAULT_BOUNDARY_EVIDENCE_OPTIONS
): BoundaryEvidence {
  const samples = collectWeightedSamples(source, gridWidth, gridHeight, cellX, cellY, options.neighborhoodMargin);

  if (samples.length < 2) {
    const rgb = samples[0]?.oklab ?? [0, 0, 0];
    return { modes: [rgb], coverage: [1], spread: [0], spatialSeparation: 0, confidence: 0 };
  }

  const { centroids, assignment } = fitTwoModes(samples, options.maxLloydIterations);
  const separation = oklabDistanceSquared(centroids[0], centroids[1]);

  if (separation < options.minModeSeparation) {
    // Not a meaningfully distinct second color -- one mode, the overall neighborhood's own weighted mean.
    let sumL = 0;
    let sumA = 0;
    let sumB = 0;
    let sumW = 0;
    for (const s of samples) {
      sumL += s.oklab[0] * s.weight;
      sumA += s.oklab[1] * s.weight;
      sumB += s.oklab[2] * s.weight;
      sumW += s.weight;
    }
    const mean: Oklab = sumW > 0 ? [sumL / sumW, sumA / sumW, sumB / sumW] : [0, 0, 0];
    return { modes: [mean], coverage: [1], spread: [0], spatialSeparation: 0, confidence: 0 };
  }

  // Per-mode: within-mode spread (over the FULL neighborhood, for a
  // stable estimate), coverage (restricted to the cell's OWN footprint,
  // per the report's own Section 3/4 instruction), and spatial centroid
  // (for the spatial-coherence check).
  const spreadSum = [0, 0];
  const spreadWeight = [0, 0];
  const inCellWeight = [0, 0];
  const posSumX = [0, 0];
  const posSumY = [0, 0];
  const posWeight = [0, 0];

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const label = assignment[i];
    spreadSum[label] += oklabDistanceSquared(s.oklab, centroids[label]) * s.weight;
    spreadWeight[label] += s.weight;
    posSumX[label] += s.nx * s.weight;
    posSumY[label] += s.ny * s.weight;
    posWeight[label] += s.weight;
    inCellWeight[label] += s.cellWeight;
  }

  const spread = [0, 1].map((k) => (spreadWeight[k] > 0 ? spreadSum[k] / spreadWeight[k] : 0));
  const totalInCellWeight = inCellWeight[0] + inCellWeight[1];
  const coverage = totalInCellWeight > 0 ? [inCellWeight[0] / totalInCellWeight, inCellWeight[1] / totalInCellWeight] : [0.5, 0.5];

  const centroidPos: Array<[number, number]> = [0, 1].map((k) =>
    posWeight[k] > 0 ? [posSumX[k] / posWeight[k], posSumY[k] / posWeight[k]] : [0.5, 0.5]
  );
  const spatialSeparation = Math.hypot(centroidPos[0][0] - centroidPos[1][0], centroidPos[0][1] - centroidPos[1][1]);

  // Confidence: BOTH factors must be high -- color separation must
  // dominate within-mode spread (rules out a smooth gradient's own
  // two-cluster split, which has real spread within each half), AND the
  // two modes must occupy genuinely different neighborhood positions
  // (rules out texture/noise, where color groups are spatially
  // interleaved rather than split). Either factor alone is insufficient,
  // per the report's own explicit warning that clustering success alone
  // doesn't prove a boundary.
  const maxSpread = Math.max(spread[0], spread[1]);
  const colorConfidence = separation / (separation + maxSpread);
  // A genuine straight split through a neighborhood typically separates
  // mode centroids by roughly 0.3-0.6 in normalized coordinates -- 0.5
  // is used as the reference scale a "fully separated" split saturates at.
  const spatialConfidence = Math.min(1, spatialSeparation / 0.5);
  const confidence = colorConfidence * spatialConfidence;

  return {
    modes: [centroids[0], centroids[1]],
    coverage,
    spread,
    spatialSeparation,
    confidence,
  };
}
