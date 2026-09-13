import { luminance } from "../color/color";
import type { PixelBuffer } from "../types";

// Raw Sobel responses below this are sensor/JPEG noise, not an edge: i.i.d.
// noise of a few 8-bit levels reaches ~30-40 raw units with no structure
// (docs/domain-reference.md §6.3, D11).
const NOISE_FLOOR = 40;
// Normalizing by a high percentile rather than the single max: one outlier
// (a JPEG block edge, a specular highlight) would otherwise crush every
// real edge toward zero (D11).
const NORMALIZATION_PERCENTILE = 0.999;

/** Sobel gradient magnitude on source luminance, normalized to 0-1 by the 99.9th percentile. */
export function computeEdgeMagnitude(source: PixelBuffer): Float32Array {
  const { width, height, data } = source;
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    gray[i] = luminance([data[o], data[o + 1], data[o + 2]]);
  }

  const magnitude = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const xm1 = Math.max(0, x - 1);
      const xp1 = Math.min(width - 1, x + 1);
      const ym1 = Math.max(0, y - 1);
      const yp1 = Math.min(height - 1, y + 1);

      const tl = gray[ym1 * width + xm1];
      const tc = gray[ym1 * width + x];
      const tr = gray[ym1 * width + xp1];
      const ml = gray[y * width + xm1];
      const mr = gray[y * width + xp1];
      const bl = gray[yp1 * width + xm1];
      const bc = gray[yp1 * width + x];
      const br = gray[yp1 * width + xp1];

      const gx = tr + 2 * mr + br - (tl + 2 * ml + bl);
      const gy = bl + 2 * bc + br - (tl + 2 * tc + tr);
      const g = Math.sqrt(gx * gx + gy * gy);

      magnitude[y * width + x] = g < NOISE_FLOOR ? 0 : g;
    }
  }

  const normalizer = selectKth(magnitude, Math.floor((magnitude.length - 1) * NORMALIZATION_PERCENTILE)) || 1;
  for (let i = 0; i < magnitude.length; i++) {
    magnitude[i] = Math.min(1, magnitude[i] / normalizer);
  }
  return magnitude;
}

const SELECT_BINS = 4096;
const SELECT_SORT_LIMIT = 1 << 16;

/**
 * The k-th smallest value (0-based) of `values` -- exactly what
 * `Float32Array.from(values).sort()[k]` returns, in O(n) instead of a full
 * sort of up to 16 M source pixels (review E4). Histogram bins narrow the
 * candidates until they're few enough to sort; all values in the chosen
 * bin are collected, so the answer is the true order statistic, not a bin
 * midpoint.
 */
export function selectKth(values: Float32Array, k: number): number {
  let candidates = values;
  let rank = k;
  for (;;) {
    if (candidates.length <= SELECT_SORT_LIMIT) {
      return Float32Array.from(candidates).sort()[rank];
    }
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < candidates.length; i++) {
      const v = candidates[i];
      // NaN and -0 have sort positions the histogram can't express
      // (NaN last, -0 before +0); fall back to the exact sort for them.
      if (v !== v || (v === 0 && 1 / v < 0)) return Float32Array.from(candidates).sort()[rank];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (min === max) return min;

    const scale = SELECT_BINS / (max - min);
    const counts = new Int32Array(SELECT_BINS);
    for (let i = 0; i < candidates.length; i++) {
      counts[Math.min(SELECT_BINS - 1, Math.floor((candidates[i] - min) * scale))]++;
    }
    let bin = 0;
    let below = 0;
    while (below + counts[bin] <= rank) {
      below += counts[bin];
      bin++;
    }
    const next = new Float32Array(counts[bin]);
    let n = 0;
    for (let i = 0; i < candidates.length; i++) {
      if (Math.min(SELECT_BINS - 1, Math.floor((candidates[i] - min) * scale)) === bin) next[n++] = candidates[i];
    }
    candidates = next;
    rank -= below;
  }
}

/**
 * Per-cell importance (0-1): 0.7 x the max edge magnitude inside the cell
 * + 0.3 x the cell's own luminance contrast (a detail can sit inside one
 * cell without a strong edge at its boundary -- Owner's spec section 4).
 */
export function computeCellImportance(source: PixelBuffer, edgeMagnitude: Float32Array, gridWidth: number, gridHeight: number): Float32Array {
  const { width: srcW, height: srcH, data } = source;
  const cellMaxEdge = new Float32Array(gridWidth * gridHeight);
  const cellLumaSum = new Float64Array(gridWidth * gridHeight);
  const cellLumaSumSq = new Float64Array(gridWidth * gridHeight);
  const cellCount = new Float64Array(gridWidth * gridHeight);

  for (let y = 0; y < srcH; y++) {
    const cellY = Math.min(gridHeight - 1, Math.floor((y * gridHeight) / srcH));
    for (let x = 0; x < srcW; x++) {
      const cellX = Math.min(gridWidth - 1, Math.floor((x * gridWidth) / srcW));
      const cellIndex = cellY * gridWidth + cellX;
      const srcIndex = y * srcW + x;
      const o = srcIndex * 4;

      if (edgeMagnitude[srcIndex] > cellMaxEdge[cellIndex]) cellMaxEdge[cellIndex] = edgeMagnitude[srcIndex];

      const l = luminance([data[o], data[o + 1], data[o + 2]]) / 255;
      cellLumaSum[cellIndex] += l;
      cellLumaSumSq[cellIndex] += l * l;
      cellCount[cellIndex]++;
    }
  }

  const importance = new Float32Array(gridWidth * gridHeight);
  for (let i = 0; i < importance.length; i++) {
    const n = cellCount[i] || 1;
    const mean = cellLumaSum[i] / n;
    const variance = Math.max(0, cellLumaSumSq[i] / n - mean * mean);
    // stdev of a 0-1 signal maxes out at 0.5 (half-black/half-white split); normalize accordingly.
    const contrast = Math.min(1, Math.sqrt(variance) / 0.5);
    importance[i] = Math.min(1, 0.7 * cellMaxEdge[i] + 0.3 * contrast);
  }
  return importance;
}

/** Approximate edge strength across a specific cell-to-cell boundary, from each side's own importance. */
export function edgeBetweenCells(importance: Float32Array, i: number, j: number): number {
  return Math.max(importance[i], importance[j]);
}
