// Frozen copy of lib/crisp/crisp-edge-evidence.ts as of G-047 M3 (commit 2b7fce9), before M4's separation bound, with
// both edge models. The reference for tests/unit/crisp-separation-bound.spec.ts; never edit it to follow the live file.
import { writeOklab, type Oklab } from "@/lib/color/color";
import type { PixelBuffer } from "@/lib/types";

/**
 * Source-side boundary evidence for Crisp mode (G-024, D57/D58): for one cell, fits a deterministic two-color model to
 * a small source neighborhood around it and scores confidence that it shows a genuine two-region hard boundary rather
 * than a smooth gradient or noise (design report Sections 3 and 4). Called only for pre-filtered candidate cells.
 *
 * Samples live in reused typed arrays, and each source row's OKLab values are computed once and shared by every
 * overlapping neighborhood through `SourceOklabRows` (G-035 M4). The arithmetic, including the order of every sum, is
 * the pre-M4 version's, so results are bit-identical (tests/unit/crisp-evidence-equivalence.spec.ts).
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
  /**
   * Unit vector (in the same neighborhood-normalized [0,1] coordinates as `spatialSeparation`, NOT aspect-corrected
   * true source-pixel direction) pointing from mode 0's spatial centroid toward mode 1's. `null` when only one mode was
   * found or the two centroids coincide (D64).
   */
  boundaryDirection: [number, number] | null;
  /**
   * [0,1]: how much better a two-color STEP model along `boundaryDirection` explains the samples than an AFFINE ramp
   * does. Color separation and spatial separation alone can't tell a steep smooth gradient from a real step (D59, D63,
   * D64). 1 when only one mode was found.
   */
  edgeSharpness: number;
  /** Combined [0,1] confidence that this cell's neighborhood shows a genuine two-region hard boundary. 0 when only one mode was found. */
  confidence: number;
}

export interface BoundaryEvidenceOptions {
  /** How far to expand the sampling neighborhood beyond the cell's own footprint, as a fraction of the cell's own width/height. The report's own "small source neighborhood" -- not the whole image. */
  neighborhoodMargin: number;
  /** Minimum squared-OKLab distance between the two fitted modes to even consider them distinct -- guards against calling ordinary sampling/anti-aliasing noise within one true region a "boundary." ~1 JND, matching contour-cleanup.ts's own `costCeiling` convention. */
  minModeSeparation: number;
  maxLloydIterations: number;
  /**
   * "step" (default, Crisp): sharpness compares a hard two-colour step with an affine ramp. "blurred-step" (Crisp+,
   * G-038): also fits a logistic step of fitted centre and width, and keeps whichever explanation is more confident,
   * with the plateau colours on either side as the modes (D139).
   */
  edgeModel?: EdgeModel;
}

export type EdgeModel = "step" | "blurred-step";

export const DEFAULT_BOUNDARY_EVIDENCE_OPTIONS: BoundaryEvidenceOptions = {
  neighborhoodMargin: 0.75,
  minModeSeparation: 0.02,
  maxLloydIterations: 6,
};

/** Rows kept at most; a job reads cells in row order, so rows above the current neighborhood are dropped first. */
const MAX_CACHED_ROWS = 512;

/**
 * Per-row OKLab values of one source photo, computed on first use and shared by every neighborhood that overlaps the
 * row (G-035 M4). Rows above the neighborhood being read are evicted, and at most `MAX_CACHED_ROWS` are held, so a
 * 12 MP photo never needs a full 288 MB plane. Values are `writeOklab`'s, identical to per-pixel conversion.
 */
export class SourceOklabRows {
  private readonly rows = new Map<number, Float64Array>();

  constructor(readonly source: PixelBuffer) {}

  row(y: number): Float64Array {
    let row = this.rows.get(y);
    if (!row) {
      const { width, data } = this.source;
      row = new Float64Array(width * 3);
      for (let x = 0, p = y * width * 4; x < width; x++, p += 4) writeOklab(data[p], data[p + 1], data[p + 2], row, x * 3);
      this.rows.set(y, row);
    }
    return row;
  }

  /** Drops rows above `firstNeededRow`, then the lowest-numbered rows while more than `MAX_CACHED_ROWS` remain. */
  release(firstNeededRow: number): void {
    for (const y of this.rows.keys()) if (y < firstNeededRow) this.rows.delete(y);
    if (this.rows.size <= MAX_CACHED_ROWS) return;
    const keys = [...this.rows.keys()].sort((a, b) => a - b);
    for (let i = 0; this.rows.size > MAX_CACHED_ROWS; i++) this.rows.delete(keys[i]);
  }
}

/** One neighborhood's samples as parallel columns, reused across cells and grown on demand. */
class SampleColumns {
  count = 0;
  L = new Float64Array(0);
  A = new Float64Array(0);
  B = new Float64Array(0);
  weight = new Float64Array(0);
  nx = new Float64Array(0);
  ny = new Float64Array(0);
  /** This pixel's alpha-weighted fractional overlap with the CELL's own footprint, computed independently of `weight` (D59). */
  cellWeight = new Float64Array(0);
  assignment = new Uint8Array(0);
  projection = new Float64Array(0);

  reserve(capacity: number): void {
    if (this.L.length >= capacity) return;
    const size = Math.max(capacity, this.L.length * 2);
    this.L = new Float64Array(size);
    this.A = new Float64Array(size);
    this.B = new Float64Array(size);
    this.weight = new Float64Array(size);
    this.nx = new Float64Array(size);
    this.ny = new Float64Array(size);
    this.cellWeight = new Float64Array(size);
    this.assignment = new Uint8Array(size);
    this.projection = new Float64Array(size);
  }
}

const sharedSamples = new SampleColumns();

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

/**
 * Alpha- and fractional-coverage-weighted source samples for a cell's expanded neighborhood, using exactly
 * `downsampleToGrid`'s per-pixel weights. `cellWeight` is each pixel's own fractional overlap with the cell's bounds,
 * computed like `weight`; a binary pixel-center test corrupted coverage at exactly the boundary cells (D59).
 */
function collectWeightedSamples(
  rows: SourceOklabRows,
  gridWidth: number,
  gridHeight: number,
  cellX: number,
  cellY: number,
  neighborhoodMargin: number,
  out: SampleColumns
): void {
  const { width: srcW, height: srcH, data } = rows.source;

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

  const nbW = nbXEnd - nbXStart || 1;
  const nbH = nbYEnd - nbYStart || 1;

  rows.release(yFirst);
  out.reserve(Math.max(0, xLast - xFirst + 1) * Math.max(0, yLast - yFirst + 1));
  let n = 0;

  for (let y = yFirst; y <= yLast; y++) {
    const yWeight = overlap(y, y + 1, nbYStart, nbYEnd);
    if (yWeight <= 0) continue;
    const yCellWeight = overlap(y, y + 1, cellYStart, cellYEnd);
    let row: Float64Array | null = null;
    for (let x = xFirst; x <= xLast; x++) {
      const xWeight = overlap(x, x + 1, nbXStart, nbXEnd);
      if (xWeight <= 0) continue;
      const pixelIndex = (y * srcW + x) * 4;
      const alpha = data[pixelIndex + 3] / 255;
      const weight = xWeight * yWeight * alpha;
      if (weight <= 0) continue;

      const xCellWeight = overlap(x, x + 1, cellXStart, cellXEnd);
      row ??= rows.row(y);
      const o = x * 3;
      out.L[n] = row[o];
      out.A[n] = row[o + 1];
      out.B[n] = row[o + 2];
      out.weight[n] = weight;
      out.nx[n] = (x + 0.5 - nbXStart) / nbW;
      out.ny[n] = (y + 0.5 - nbYStart) / nbH;
      out.cellWeight[n] = Math.max(0, xCellWeight) * Math.max(0, yCellWeight) * alpha;
      n++;
    }
  }
  out.count = n;
}

/**
 * Weighted 2-means with farthest-point initialization (deterministic, no random seeding). Writes each sample's 0/1
 * label into `s.assignment` and returns the two centroids. Needs at least 2 samples.
 */
function fitTwoModes(s: SampleColumns, maxIterations: number): [Oklab, Oklab] {
  const n = s.count;
  const { L, A, B, weight, assignment } = s;

  // First seed: the sample farthest from the weighted mean (ties go to the earliest); second: farthest from the first.
  let meanL = 0;
  let meanA = 0;
  let meanB = 0;
  let totalWeight = 0;
  for (let i = 0; i < n; i++) {
    meanL += L[i] * weight[i];
    meanA += A[i] * weight[i];
    meanB += B[i] * weight[i];
    totalWeight += weight[i];
  }
  if (totalWeight > 0) {
    meanL = meanL / totalWeight;
    meanA = meanA / totalWeight;
    meanB = meanB / totalWeight;
  } else {
    meanL = L[0];
    meanA = A[0];
    meanB = B[0];
  }

  let seed0 = 0;
  let bestDist = -1;
  for (let i = 0; i < n; i++) {
    const dl = L[i] - meanL;
    const da = A[i] - meanA;
    const db = B[i] - meanB;
    const d = dl * dl + da * da + db * db;
    if (d > bestDist) {
      bestDist = d;
      seed0 = i;
    }
  }
  let seed1 = 0;
  bestDist = -1;
  for (let i = 0; i < n; i++) {
    const dl = L[i] - L[seed0];
    const da = A[i] - A[seed0];
    const db = B[i] - B[seed0];
    const d = dl * dl + da * da + db * db;
    if (d > bestDist) {
      bestDist = d;
      seed1 = i;
    }
  }

  let c0L = L[seed0];
  let c0A = A[seed0];
  let c0B = B[seed0];
  let c1L = L[seed1];
  let c1A = A[seed1];
  let c1B = B[seed1];
  assignment.fill(0, 0, n);

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let dl = L[i] - c0L;
      let da = A[i] - c0A;
      let db = B[i] - c0B;
      const d0 = dl * dl + da * da + db * db;
      dl = L[i] - c1L;
      da = A[i] - c1A;
      db = B[i] - c1B;
      const d1 = dl * dl + da * da + db * db;
      const label = d1 < d0 ? 1 : 0;
      if (assignment[i] !== label) {
        assignment[i] = label;
        changed = true;
      }
    }

    let s0L = 0;
    let s0A = 0;
    let s0B = 0;
    let s1L = 0;
    let s1A = 0;
    let s1B = 0;
    let w0 = 0;
    let w1 = 0;
    for (let i = 0; i < n; i++) {
      if (assignment[i] === 1) {
        s1L += L[i] * weight[i];
        s1A += A[i] * weight[i];
        s1B += B[i] * weight[i];
        w1 += weight[i];
      } else {
        s0L += L[i] * weight[i];
        s0A += A[i] * weight[i];
        s0B += B[i] * weight[i];
        w0 += weight[i];
      }
    }
    if (w0 > 0) {
      c0L = s0L / w0;
      c0A = s0A / w0;
      c0B = s0B / w0;
    }
    if (w1 > 0) {
      c1L = s1L / w1;
      c1A = s1A / w1;
      c1B = s1B / w1;
    }

    if (!changed) break;
  }

  return [
    [c0L, c0A, c0B],
    [c1L, c1A, c1B],
  ];
}

/**
 * Compares how well a two-constant-color STEP model explains the samples against a per-channel AFFINE ramp along
 * `direction` through `midpoint` (D64). The step residual is the 2-means spread, passed in; the affine model is a
 * weighted linear regression of each OKLab channel against each sample's projection onto `direction`.
 */
function computeEdgeSharpness(s: SampleColumns, dirX: number, dirY: number, midX: number, midY: number, stepResidual: number): number {
  const n = s.count;
  const { L, A, B, weight, nx, ny, projection } = s;
  let sumW = 0;
  let sumWT = 0;
  let sumWCL = 0;
  let sumWCA = 0;
  let sumWCB = 0;

  for (let i = 0; i < n; i++) {
    const t = (nx[i] - midX) * dirX + (ny[i] - midY) * dirY;
    projection[i] = t;
    sumW += weight[i];
    sumWT += weight[i] * t;
    sumWCL += weight[i] * L[i];
    sumWCA += weight[i] * A[i];
    sumWCB += weight[i] * B[i];
  }
  if (sumW <= 0) return 1;

  const tMean = sumWT / sumW;
  const cMeanL = sumWCL / sumW;
  const cMeanA = sumWCA / sumW;
  const cMeanB = sumWCB / sumW;

  let sxx = 0;
  let sxyL = 0;
  let sxyA = 0;
  let sxyB = 0;
  for (let i = 0; i < n; i++) {
    const dt = projection[i] - tMean;
    sxx += weight[i] * dt * dt;
    sxyL += weight[i] * dt * (L[i] - cMeanL);
    sxyA += weight[i] * dt * (A[i] - cMeanA);
    sxyB += weight[i] * dt * (B[i] - cMeanB);
  }
  const slopeL = sxx > 0 ? sxyL / sxx : 0;
  const slopeA = sxx > 0 ? sxyA / sxx : 0;
  const slopeB = sxx > 0 ? sxyB / sxx : 0;
  const interceptL = cMeanL - slopeL * tMean;
  const interceptA = cMeanA - slopeA * tMean;
  const interceptB = cMeanB - slopeB * tMean;

  let affineResidualSum = 0;
  for (let i = 0; i < n; i++) {
    const t = projection[i];
    const dl = L[i] - (interceptL + slopeL * t);
    const da = A[i] - (interceptA + slopeA * t);
    const db = B[i] - (interceptB + slopeB * t);
    affineResidualSum += weight[i] * (dl * dl + da * da + db * db);
  }
  const affineResidual = affineResidualSum / sumW;

  const denom = affineResidual + stepResidual;
  return denom > 0 ? affineResidual / denom : 1;
}

/** Projection bins for the blurred-step fit: models are compared on bin means plus the within-bin scatter every model shares. */
const BLUR_BINS = 48;
/** Logistic scales tried, in neighborhood-normalized units (the neighborhood spans 2.5 cells at the default margin). */
const BLUR_WIDTHS = [0.02, 0.04, 0.07, 0.1, 0.14];
/** Offsets of the logistic centre from the two spatial centroids' midpoint, in the same units. */
const BLUR_CENTRE_OFFSETS = [-0.12, -0.09, -0.06, -0.03, 0, 0.03, 0.06, 0.09, 0.12];
/** A sample is on a plateau when the fitted logistic is below this value or above 1 minus it. */
const PLATEAU_LEVEL = 0.12;
/** Each plateau must hold at least this share of the neighborhood's weight for its colour to be trusted. */
const MIN_PLATEAU_SHARE = 0.08;

const bins = {
  w: new Float64Array(BLUR_BINS),
  t: new Float64Array(BLUR_BINS),
  L: new Float64Array(BLUR_BINS),
  A: new Float64Array(BLUR_BINS),
  B: new Float64Array(BLUR_BINS),
};

interface BlurredStepFit {
  modes: [Oklab, Oklab];
  coverage: [number, number];
  spread: [number, number];
  edgeSharpness: number;
}

const logistic = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * The blurred-step explanation of one neighborhood (G-038, D139). Samples are binned by their projection onto the
 * boundary direction, which `computeEdgeSharpness` has already written into `s.projection`. Each channel is regressed on
 * `logistic((t − t0) / w)` over a small grid of centres and widths, and on `t` itself for the affine ramp; both see the
 * same bins, so the comparison is like for like. Plateau colours are weighted means of the samples the best logistic
 * puts clearly on either side, never extrapolated. Returns null when either plateau is too thin to trust.
 */
function fitBlurredStep(s: SampleColumns, midT: number): BlurredStepFit | null {
  const n = s.count;
  const { L, A, B, weight, projection, cellWeight } = s;
  let tMin = Infinity;
  let tMax = -Infinity;
  for (let i = 0; i < n; i++) {
    if (weight[i] <= 0) continue;
    if (projection[i] < tMin) tMin = projection[i];
    if (projection[i] > tMax) tMax = projection[i];
  }
  if (!(tMax > tMin)) return null;

  bins.w.fill(0);
  bins.t.fill(0);
  bins.L.fill(0);
  bins.A.fill(0);
  bins.B.fill(0);
  const binScale = BLUR_BINS / (tMax - tMin);
  let totalW = 0;
  let totalSq = 0;
  for (let i = 0; i < n; i++) {
    const w = weight[i];
    if (w <= 0) continue;
    const b = Math.min(BLUR_BINS - 1, Math.floor((projection[i] - tMin) * binScale));
    bins.w[b] += w;
    bins.t[b] += w * projection[i];
    bins.L[b] += w * L[i];
    bins.A[b] += w * A[i];
    bins.B[b] += w * B[i];
    totalW += w;
    totalSq += w * (L[i] * L[i] + A[i] * A[i] + B[i] * B[i]);
  }
  if (totalW <= 0) return null;

  // Every model's residual = within-bin scatter (shared) + the regression residual of the bin means.
  let meanL = 0;
  let meanA = 0;
  let meanB = 0;
  let betweenSq = 0;
  for (let b = 0; b < BLUR_BINS; b++) {
    const w = bins.w[b];
    if (w <= 0) continue;
    bins.t[b] /= w;
    bins.L[b] /= w;
    bins.A[b] /= w;
    bins.B[b] /= w;
    meanL += w * bins.L[b];
    meanA += w * bins.A[b];
    meanB += w * bins.B[b];
    betweenSq += w * (bins.L[b] * bins.L[b] + bins.A[b] * bins.A[b] + bins.B[b] * bins.B[b]);
  }
  meanL /= totalW;
  meanA /= totalW;
  meanB /= totalW;
  const meanSq = meanL * meanL + meanA * meanA + meanB * meanB;
  const withinScatter = Math.max(0, totalSq - betweenSq);
  const betweenScatter = Math.max(0, betweenSq - totalW * meanSq);

  /** Residual per unit weight of regressing the bin means on `feature(t)`. */
  const residualFor = (feature: (t: number) => number) => {
    let xMean = 0;
    for (let b = 0; b < BLUR_BINS; b++) if (bins.w[b] > 0) xMean += bins.w[b] * feature(bins.t[b]);
    xMean /= totalW;
    let sxx = 0;
    let sxL = 0;
    let sxA = 0;
    let sxB = 0;
    for (let b = 0; b < BLUR_BINS; b++) {
      const w = bins.w[b];
      if (w <= 0) continue;
      const dx = feature(bins.t[b]) - xMean;
      sxx += w * dx * dx;
      sxL += w * dx * (bins.L[b] - meanL);
      sxA += w * dx * (bins.A[b] - meanA);
      sxB += w * dx * (bins.B[b] - meanB);
    }
    const explained = sxx > 0 ? (sxL * sxL + sxA * sxA + sxB * sxB) / sxx : 0;
    return (withinScatter + Math.max(0, betweenScatter - explained)) / totalW;
  };

  const affineResidual = residualFor((t) => t);
  let bestResidual = Infinity;
  let bestT0 = midT;
  let bestWidth = BLUR_WIDTHS[0];
  for (const width of BLUR_WIDTHS) {
    for (const offset of BLUR_CENTRE_OFFSETS) {
      const t0 = midT + offset;
      const residual = residualFor((t) => logistic((t - t0) / width));
      if (residual < bestResidual) {
        bestResidual = residual;
        bestT0 = t0;
        bestWidth = width;
      }
    }
  }

  const sums = [
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
  ]; // per side: weight, L, A, B, squared norm
  let inCell0 = 0;
  let inCell1 = 0;
  for (let i = 0; i < n; i++) {
    const w = weight[i];
    if (w > 0) {
      const level = logistic((projection[i] - bestT0) / bestWidth);
      const side = level < PLATEAU_LEVEL ? sums[0] : level > 1 - PLATEAU_LEVEL ? sums[1] : null;
      if (side) {
        side[0] += w;
        side[1] += w * L[i];
        side[2] += w * A[i];
        side[3] += w * B[i];
        side[4] += w * (L[i] * L[i] + A[i] * A[i] + B[i] * B[i]);
      }
    }
    if (projection[i] < bestT0) inCell0 += cellWeight[i];
    else inCell1 += cellWeight[i];
  }
  if (sums[0][0] < MIN_PLATEAU_SHARE * totalW || sums[1][0] < MIN_PLATEAU_SHARE * totalW) return null;
  const inCell = inCell0 + inCell1;
  if (inCell <= 0) return null;

  const modes = sums.map(([w, sl, sa, sb]) => [sl / w, sa / w, sb / w] as Oklab) as [Oklab, Oklab];
  const spread = sums.map(([w, , , , sq], k) => {
    const m = modes[k];
    return Math.max(0, sq / w - (m[0] * m[0] + m[1] * m[1] + m[2] * m[2]));
  }) as [number, number];
  const denom = affineResidual + bestResidual;
  return {
    modes,
    coverage: [inCell0 / inCell, inCell1 / inCell],
    spread,
    edgeSharpness: denom > 0 ? affineResidual / denom : 1,
  };
}

/** The whole neighborhood's weighted mean color, the single mode reported when no genuine second mode is found. */
function weightedMean(s: SampleColumns): Oklab {
  let sumL = 0;
  let sumA = 0;
  let sumB = 0;
  let sumW = 0;
  for (let i = 0; i < s.count; i++) {
    sumL += s.L[i] * s.weight[i];
    sumA += s.A[i] * s.weight[i];
    sumB += s.B[i] * s.weight[i];
    sumW += s.weight[i];
  }
  return sumW > 0 ? [sumL / sumW, sumA / sumW, sumB / sumW] : [0, 0, 0];
}

function singleMode(mode: Oklab): BoundaryEvidence {
  return { modes: [mode], coverage: [1], spread: [0], spatialSeparation: 0, boundaryDirection: null, edgeSharpness: 1, confidence: 0 };
}

/**
 * The main entry point: fits a two-mode description for one cell's neighborhood and scores confidence that it
 * represents a genuine hard boundary -- color separation, spatial organization and edge sharpness (Section 4). Pass
 * the same `rows` for every cell of one photo so each source row is converted to OKLab once.
 */
export function extractBoundaryEvidence(
  source: PixelBuffer,
  gridWidth: number,
  gridHeight: number,
  cellX: number,
  cellY: number,
  options: BoundaryEvidenceOptions = DEFAULT_BOUNDARY_EVIDENCE_OPTIONS,
  rows: SourceOklabRows = new SourceOklabRows(source)
): BoundaryEvidence {
  if (rows.source !== source) throw new Error("extractBoundaryEvidence: `rows` belongs to a different source buffer");
  const s = sharedSamples;
  collectWeightedSamples(rows, gridWidth, gridHeight, cellX, cellY, options.neighborhoodMargin, s);
  const n = s.count;

  if (n < 2) return singleMode(n === 1 ? [s.L[0], s.A[0], s.B[0]] : [0, 0, 0]);

  const [c0, c1] = fitTwoModes(s, options.maxLloydIterations);
  const { L, A, B, weight, nx, ny, cellWeight, assignment } = s;
  const sepL = c0[0] - c1[0];
  const sepA = c0[1] - c1[1];
  const sepB = c0[2] - c1[2];
  const separation = sepL * sepL + sepA * sepA + sepB * sepB;

  // Not a meaningfully distinct second color: one mode, the neighborhood's weighted mean.
  if (separation < options.minModeSeparation) return singleMode(weightedMean(s));

  // Per mode: spread over the full neighborhood, coverage within the cell's own footprint, and spatial centroid.
  let spreadSum0 = 0;
  let spreadSum1 = 0;
  let spreadWeight0 = 0;
  let spreadWeight1 = 0;
  let inCell0 = 0;
  let inCell1 = 0;
  let posX0 = 0;
  let posX1 = 0;
  let posY0 = 0;
  let posY1 = 0;
  let posWeight0 = 0;
  let posWeight1 = 0;

  for (let i = 0; i < n; i++) {
    const c = assignment[i] === 1 ? c1 : c0;
    const dl = L[i] - c[0];
    const da = A[i] - c[1];
    const db = B[i] - c[2];
    const d = (dl * dl + da * da + db * db) * weight[i];
    if (assignment[i] === 1) {
      spreadSum1 += d;
      spreadWeight1 += weight[i];
      posX1 += nx[i] * weight[i];
      posY1 += ny[i] * weight[i];
      posWeight1 += weight[i];
      inCell1 += cellWeight[i];
    } else {
      spreadSum0 += d;
      spreadWeight0 += weight[i];
      posX0 += nx[i] * weight[i];
      posY0 += ny[i] * weight[i];
      posWeight0 += weight[i];
      inCell0 += cellWeight[i];
    }
  }

  const spread = [spreadWeight0 > 0 ? spreadSum0 / spreadWeight0 : 0, spreadWeight1 > 0 ? spreadSum1 / spreadWeight1 : 0];
  const totalInCellWeight = inCell0 + inCell1;

  // A cell whose own footprint has no real weighted samples must never count as a confident boundary, even when its
  // wider neighborhood fits two modes (D63).
  if (totalInCellWeight <= 0) return singleMode(weightedMean(s));

  const coverage = [inCell0 / totalInCellWeight, inCell1 / totalInCellWeight];

  const cx0 = posWeight0 > 0 ? posX0 / posWeight0 : 0.5;
  const cy0 = posWeight0 > 0 ? posY0 / posWeight0 : 0.5;
  const cx1 = posWeight1 > 0 ? posX1 / posWeight1 : 0.5;
  const cy1 = posWeight1 > 0 ? posY1 / posWeight1 : 0.5;
  const spatialSeparation = Math.hypot(cx0 - cx1, cy0 - cy1);

  let boundaryDirection: [number, number] | null = null;
  let edgeSharpness = 1;
  if (spatialSeparation > 0) {
    boundaryDirection = [(cx1 - cx0) / spatialSeparation, (cy1 - cy0) / spatialSeparation];
    const stepResidual = (spreadSum0 + spreadSum1) / (spreadWeight0 + spreadWeight1);
    edgeSharpness = computeEdgeSharpness(s, boundaryDirection[0], boundaryDirection[1], (cx0 + cx1) / 2, (cy0 + cy1) / 2, stepResidual);
  }

  // Confidence needs all three: color separation dominating within-mode spread (rules out a gradient's two-cluster
  // split), spatially separated modes (rules out texture and noise), and an abrupt transition (rules out a steep smooth
  // gradient; D59, D63, D64). A genuine straight split separates mode centroids by roughly 0.3–0.6 in normalized
  // coordinates, so 0.5 is where spatial confidence saturates.
  const maxSpread = Math.max(spread[0], spread[1]);
  const colorConfidence = separation / (separation + maxSpread);
  const spatialConfidence = Math.min(1, spatialSeparation / 0.5);
  const confidence = colorConfidence * spatialConfidence * edgeSharpness;

  if (options.edgeModel === "blurred-step" && boundaryDirection) {
    // `computeEdgeSharpness` projected every sample relative to the centroids' midpoint, so that midpoint is t = 0.
    const blurred = fitBlurredStep(s, 0);
    if (blurred) {
      const [m0, m1] = blurred.modes;
      const plateauSeparation = (m0[0] - m1[0]) ** 2 + (m0[1] - m1[1]) ** 2 + (m0[2] - m1[2]) ** 2;
      const plateauSpread = Math.max(blurred.spread[0], blurred.spread[1]);
      if (plateauSeparation >= options.minModeSeparation) {
        const blurredConfidence = (plateauSeparation / (plateauSeparation + plateauSpread)) * spatialConfidence * blurred.edgeSharpness;
        if (blurredConfidence > confidence) {
          return {
            modes: blurred.modes,
            coverage: blurred.coverage,
            spread: blurred.spread,
            spatialSeparation,
            boundaryDirection,
            edgeSharpness: blurred.edgeSharpness,
            confidence: blurredConfidence,
          };
        }
      }
    }
  }

  return { modes: [c0, c1], coverage, spread, spatialSeparation, boundaryDirection, edgeSharpness, confidence };
}
