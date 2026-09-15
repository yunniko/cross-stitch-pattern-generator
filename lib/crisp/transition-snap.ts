import { oklabDistanceSquared, rgbToOklab } from "../color/color";
import type { PixelBuffer, RGB } from "../types";

/**
 * Crisp+ transition-strip snapping (G-038 M2, D140). A blurred edge between two regions leaves a short run of in-between
 * colours across it. For each cell this looks along four directions for such a run between two side colours that each
 * hold a run of their own, with every run colour on the side-to-side colour line in linear light. The source photo must
 * then confirm the run: across the chain its profile must be a blurred step, clearly better explained by a logistic than
 * by a straight ramp (a gradient), and not much better explained by three flat levels (a real thin line). Each strip
 * cell then takes the side of the fitted edge centre it lies on. Decisions read the labels as they were before the pass.
 */

export interface TransitionSnapOptions {
  /** Most in-between cells between the two side runs along one direction. */
  maxSpanCells: number;
  /** Cells of the same colour a side needs along the direction to count as a region rather than another band. */
  minSideRun: number;
  /** Largest distance of a run colour from the side-to-side line, as a share of the line's length (linear RGB). */
  maxPerpendicular: number;
  /** Smallest OKLab distance between the two side colours. */
  minSideDistance: number;
  /** Smallest affine / (affine + logistic) residual ratio of the source profile: rules out gradients. */
  minEdgeSharpness: number;
  /** The run is a real line when three flat levels fit the profile with less than this share of the logistic's residual. */
  lineResidualRatio: number;
  /** Passes, each reading the previous pass's labels; stops early when a pass changes nothing. */
  passes: number;
}

/** Calibrated in G-038 M2 against the blur series, thin lines, gradients and noise (D140). */
export const DEFAULT_TRANSITION_SNAP_OPTIONS: TransitionSnapOptions = {
  maxSpanCells: 5,
  minSideRun: 3,
  maxPerpendicular: 0.25,
  minSideDistance: 0.1,
  minEdgeSharpness: 0.75,
  lineResidualRatio: 0.5,
  passes: 2,
};

const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

const SRGB_TO_LINEAR = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const v = i / 255;
  SRGB_TO_LINEAR[i] = v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** Logistic widths tried for the source profile, as a share of one cell's size in source pixels. */
const PROFILE_WIDTHS = [0.05, 0.15, 0.3, 0.6, 1, 1.5];
const MAX_PROFILE_BINS = 64;
const MAX_CENTRE_STEPS = 24;
/** Along the colour line, a run colour must lie strictly inside (0, 1) by this margin and the runs may step back by at most this much. */
const LINE_MARGIN = 0.05;
const MONOTONE_SLACK = 0.1;

export interface TransitionSnapResult {
  cellPaletteIndex: Uint8Array;
  /** Cell changes summed over passes. */
  changes: number;
  /** 1 for every cell whose final label differs from its input label. */
  snapped: Uint8Array;
}

interface ChainVerdict {
  a: number;
  b: number;
  /** Fitted edge centre, as a projection onto the direction in source pixels; NaN when the source rejects the chain. */
  centre: number;
}

export function snapTransitionStrips(
  labels: Uint8Array,
  gridWidth: number,
  gridHeight: number,
  palette: readonly RGB[],
  source: PixelBuffer,
  options: TransitionSnapOptions = DEFAULT_TRANSITION_SNAP_OPTIONS
): TransitionSnapResult {
  if (labels.length !== gridWidth * gridHeight) throw new Error("snapTransitionStrips: labels don't match the grid size");
  const linear = palette.map((c) => [SRGB_TO_LINEAR[c[0]], SRGB_TO_LINEAR[c[1]], SRGB_TO_LINEAR[c[2]]]);
  const oklab = palette.map((c) => rgbToOklab(c));
  const minSideDistance2 = options.minSideDistance ** 2;
  const cellW = source.width / gridWidth;
  const cellH = source.height / gridHeight;

  /** Position of a colour on the line from `a` to `b`, and its perpendicular distance as a share of the line length. */
  const onLine = (c: number, a: number, b: number) => {
    const A = linear[a];
    const B = linear[b];
    const C = linear[c];
    const ab0 = B[0] - A[0];
    const ab1 = B[1] - A[1];
    const ab2 = B[2] - A[2];
    const len2 = ab0 * ab0 + ab1 * ab1 + ab2 * ab2;
    if (len2 <= 0) return { t: NaN, perpendicular: Infinity };
    const ac0 = C[0] - A[0];
    const ac1 = C[1] - A[1];
    const ac2 = C[2] - A[2];
    const t = (ab0 * ac0 + ab1 * ac1 + ab2 * ac2) / len2;
    const p0 = ac0 - t * ab0;
    const p1 = ac1 - t * ab1;
    const p2 = ac2 - t * ab2;
    return { t, perpendicular: Math.sqrt((p0 * p0 + p1 * p1 + p2 * p2) / len2) };
  };

  let current = labels;
  let changes = 0;
  for (let pass = 0; pass < options.passes; pass++) {
    const read = current;
    const next = read.slice();
    // A chain's verdict is shared by every cell in its span: key = direction, first a-side cell, first b-side cell.
    const verdicts = new Map<string, ChainVerdict>();
    let changed = 0;

    const labelAt = (x: number, y: number) => (x < 0 || y < 0 || x >= gridWidth || y >= gridHeight ? -1 : read[y * gridWidth + x]);
    const isRun = (x: number, y: number, dx: number, dy: number, value: number) => {
      for (let k = 0; k < options.minSideRun; k++) if (labelAt(x + dx * k, y + dy * k) !== value) return false;
      return true;
    };

    for (let p = 0; p < read.length; p++) {
      const c = read[p];
      if (c >= palette.length) continue; // EMPTY_CELL and anything else outside the palette is never touched
      const px = p % gridWidth;
      const py = (p - px) / gridWidth;
      let best: { verdict: ChainVerdict; distance: number; direction: number } | null = null;

      for (let d = 0; d < DIRECTIONS.length; d++) {
        const [dx, dy] = DIRECTIONS[d];
        // A cell inside a long run along this direction is not a strip here.
        let runLength = 1;
        while (runLength <= options.maxSpanCells && labelAt(px + dx * runLength, py + dy * runLength) === c) runLength++;
        for (let k = 1; runLength <= options.maxSpanCells && labelAt(px - dx * k, py - dy * k) === c; k++) runLength++;
        if (runLength > options.maxSpanCells) continue;

        const sides = (sign: number) => {
          const found: Array<{ k: number; value: number }> = [];
          for (let k = 1; k <= options.maxSpanCells + 1; k++) {
            const x = px + sign * dx * k;
            const y = py + sign * dy * k;
            const v = labelAt(x, y);
            if (v < 0 || v >= palette.length) break;
            if (v !== c && isRun(x, y, sign * dx, sign * dy, v)) found.push({ k, value: v });
          }
          return found;
        };
        const back = sides(-1);
        if (back.length === 0) continue;
        const forward = sides(1);
        if (forward.length === 0) continue;

        for (const sa of back) {
          for (const sb of forward) {
            if (sa.value === sb.value || sa.k - 1 + sb.k - 1 + 1 > options.maxSpanCells) continue;
            const distance = oklabDistanceSquared(oklab[sa.value], oklab[sb.value]);
            if (distance < minSideDistance2 || (best && distance <= best.distance)) continue;
            // Every cell strictly between the sides, from the a side to the b side, lies on the line and moves towards b.
            let ok = true;
            let lastT = -Infinity;
            for (let k = -(sa.k - 1); k <= sb.k - 1 && ok; k++) {
              const v = labelAt(px + dx * k, py + dy * k);
              const { t, perpendicular } = onLine(v, sa.value, sb.value);
              if (!(t > LINE_MARGIN && t < 1 - LINE_MARGIN) || perpendicular > options.maxPerpendicular || t < lastT - MONOTONE_SLACK) ok = false;
              lastT = Math.max(lastT, t);
            }
            if (!ok) continue;

            const ax = px - dx * sa.k;
            const ay = py - dy * sa.k;
            const bx = px + dx * sb.k;
            const by = py + dy * sb.k;
            const key = `${d}:${ay * gridWidth + ax}:${by * gridWidth + bx}`;
            let verdict = verdicts.get(key);
            if (!verdict) {
              const centre = fitChainProfile(source, cellW, cellH, dx, dy, ax, ay, sa.k + sb.k, options, linear[sa.value], linear[sb.value]);
              verdict = { a: sa.value, b: sb.value, centre };
              verdicts.set(key, verdict);
            }
            if (Number.isNaN(verdict.centre)) continue;
            // The most distinct pair of sides over all directions wins.
            best = { verdict, distance, direction: d };
          }
        }
      }

      if (!best) continue;
      const [dx, dy] = DIRECTIONS[best.direction];
      const norm = Math.hypot(dx, dy);
      const cellCentre = (((px + 0.5) * cellW) * dx + ((py + 0.5) * cellH) * dy) / norm;
      const target = cellCentre < best.verdict.centre ? best.verdict.a : best.verdict.b;
      if (target !== c) {
        next[p] = target;
        changed++;
      }
    }

    current = next;
    changes += changed;
    if (changed === 0) break;
  }
  const snapped = new Uint8Array(labels.length);
  for (let i = 0; i < labels.length; i++) if (current[i] !== labels[i]) snapped[i] = 1;
  return { cellPaletteIndex: current, changes, snapped };
}

/**
 * Fits the source profile across one chain: the a-side run, the strip and the b-side run, `length` + minSideRun cells
 * starting `minSideRun - 1` cells before the a-side cell at (ax, ay). Each pixel's colour is projected onto the a→b
 * line in linear light and binned by its position along the direction. Returns the fitted logistic centre, or NaN when
 * the profile looks like a ramp (low sharpness), a real line (three levels fit much better), or doesn't rise from a to b.
 */
function fitChainProfile(
  source: PixelBuffer,
  cellW: number,
  cellH: number,
  dx: number,
  dy: number,
  ax: number,
  ay: number,
  length: number,
  options: TransitionSnapOptions,
  A: number[],
  B: number[]
): number {
  const ab0 = B[0] - A[0];
  const ab1 = B[1] - A[1];
  const ab2 = B[2] - A[2];
  const len2 = ab0 * ab0 + ab1 * ab1 + ab2 * ab2;
  const norm = Math.hypot(dx, dy);
  const { width: srcW, height: srcH, data } = source;

  const first = -(options.minSideRun - 1);
  const last = length + options.minSideRun - 1;
  const cells: Array<[number, number]> = [];
  for (let k = first; k <= last; k++) cells.push([ax + dx * k, ay + dy * k]);

  let uMin = Infinity;
  let uMax = -Infinity;
  for (const [cx, cy] of cells) {
    const x0 = Math.round(cx * cellW);
    const x1 = Math.round((cx + 1) * cellW);
    const y0 = Math.round(cy * cellH);
    const y1 = Math.round((cy + 1) * cellH);
    for (const [x, y] of [
      [x0, y0],
      [x1, y0],
      [x0, y1],
      [x1, y1],
    ]) {
      const u = (x * dx + y * dy) / norm;
      uMin = Math.min(uMin, u);
      uMax = Math.max(uMax, u);
    }
  }
  const binCount = Math.max(4, Math.min(MAX_PROFILE_BINS, Math.ceil(uMax - uMin)));
  const binScale = binCount / (uMax - uMin);
  const w = new Float64Array(binCount);
  const sumU = new Float64Array(binCount);
  const sumT = new Float64Array(binCount);
  let totalSq = 0;

  for (const [cx, cy] of cells) {
    const x0 = Math.max(0, Math.round(cx * cellW));
    const x1 = Math.min(srcW, Math.round((cx + 1) * cellW));
    const y0 = Math.max(0, Math.round(cy * cellH));
    const y1 = Math.min(srcH, Math.round((cy + 1) * cellH));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const o = (y * srcW + x) * 4;
        if (data[o + 3] === 0) continue;
        const t = ((SRGB_TO_LINEAR[data[o]] - A[0]) * ab0 + (SRGB_TO_LINEAR[data[o + 1]] - A[1]) * ab1 + (SRGB_TO_LINEAR[data[o + 2]] - A[2]) * ab2) / len2;
        const u = ((x + 0.5) * dx + (y + 0.5) * dy) / norm;
        const bin = Math.min(binCount - 1, Math.max(0, Math.floor((u - uMin) * binScale)));
        w[bin] += 1;
        sumU[bin] += u;
        sumT[bin] += t;
        totalSq += t * t;
      }
    }
  }

  let total = 0;
  let betweenSq = 0;
  let meanT = 0;
  const binU: number[] = [];
  const binT: number[] = [];
  const binW: number[] = [];
  for (let i = 0; i < binCount; i++) {
    if (w[i] <= 0) continue;
    const u = sumU[i] / w[i];
    const t = sumT[i] / w[i];
    binU.push(u);
    binT.push(t);
    binW.push(w[i]);
    total += w[i];
    meanT += w[i] * t;
    betweenSq += w[i] * t * t;
  }
  if (binU.length < 4 || total <= 0) return NaN;
  meanT /= total;
  const within = Math.max(0, totalSq - betweenSq);
  const betweenScatter = Math.max(0, betweenSq - total * meanT * meanT);

  const regression = (feature: (u: number) => number) => {
    let xMean = 0;
    for (let i = 0; i < binU.length; i++) xMean += binW[i] * feature(binU[i]);
    xMean /= total;
    let sxx = 0;
    let sxy = 0;
    for (let i = 0; i < binU.length; i++) {
      const dxv = feature(binU[i]) - xMean;
      sxx += binW[i] * dxv * dxv;
      sxy += binW[i] * dxv * (binT[i] - meanT);
    }
    const slope = sxx > 0 ? sxy / sxx : 0;
    return { residual: (within + Math.max(0, betweenScatter - (sxx > 0 ? (sxy * sxy) / sxx : 0))) / total, slope };
  };

  const affine = regression((u) => u).residual;

  // Logistic centres range over the strip, between the end of the a-side run and the start of the b-side run.
  const cellSize = Math.abs(dx) * cellW + Math.abs(dy) * cellH;
  const stripStart = uMin + (options.minSideRun * cellSize) / norm;
  const stripEnd = uMax - (options.minSideRun * cellSize) / norm;
  const steps = Math.max(1, Math.min(MAX_CENTRE_STEPS, Math.ceil(stripEnd - stripStart)));
  let logisticResidual = Infinity;
  let centre = NaN;
  let slope = 0;
  const cellPx = Math.min(cellW, cellH);
  for (const widthShare of PROFILE_WIDTHS) {
    const width = Math.max(0.25, widthShare * cellPx);
    for (let s = 0; s <= steps; s++) {
      const u0 = stripStart + ((stripEnd - stripStart) * s) / steps;
      const fit = regression((u) => 1 / (1 + Math.exp(-(u - u0) / width)));
      if (fit.residual < logisticResidual) {
        logisticResidual = fit.residual;
        centre = u0;
        slope = fit.slope;
      }
    }
  }

  // Three flat levels with two breakpoints, by prefix sums over the bins.
  const n = binU.length;
  const pw = new Float64Array(n + 1);
  const pt = new Float64Array(n + 1);
  const ptt = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    pw[i + 1] = pw[i] + binW[i];
    pt[i + 1] = pt[i] + binW[i] * binT[i];
    ptt[i + 1] = ptt[i] + binW[i] * binT[i] * binT[i];
  }
  const segmentSq = (from: number, to: number) => {
    const ww = pw[to] - pw[from];
    if (ww <= 0) return 0;
    const tt = pt[to] - pt[from];
    return ptt[to] - ptt[from] - (tt * tt) / ww;
  };
  let threeLevel = Infinity;
  for (let i = 1; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const r = segmentSq(0, i) + segmentSq(i, j) + segmentSq(j, n);
      if (r < threeLevel) threeLevel = r;
    }
  }
  threeLevel = (within + threeLevel) / total;

  const sharpness = affine + logisticResidual > 0 ? affine / (affine + logisticResidual) : 1;
  if (slope < 0.5 || sharpness < options.minEdgeSharpness) return NaN;
  if (threeLevel < options.lineResidualRatio * logisticResidual) return NaN;
  return centre;
}
