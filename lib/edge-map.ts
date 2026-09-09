import { luminance } from "./color";
import type { PixelBuffer } from "./types";

// Raw Sobel responses below this are treated as sensor/JPEG noise, not a
// real edge -- i.i.d. pixel noise of a few 8-bit levels can produce Sobel
// responses up to ~30-40 raw units even with no real structure present
// (see docs/domain-reference.md §6.3). Without this floor, a flat, noisy
// region (fog, overcast sky, a smooth gradient) inflates every cell's
// importance and weakens confetti suppression exactly where it matters
// most -- a real robustness gap a 2026-09-09 domain-expert review found,
// not caught by the synthetic test images used while building this
// (their strongest gradient is always the feature under test, so it
// always normalizes to ~1.0 regardless of this floor). See HANDOVER.md D11.
const NOISE_FLOOR = 40;
// Normalizing by the single highest gradient in the image means one very
// strong outlier (a JPEG block edge, a specular highlight, hard lettering)
// crushes every other real edge toward a low value that never reaches the
// importance-protection thresholds used elsewhere in the pipeline -- also
// a real, not theoretical, failure mode per the same review. A high
// percentile is far less sensitive to a handful of outlier pixels.
const NORMALIZATION_PERCENTILE = 0.999;

/**
 * Sobel gradient magnitude on source luminance, normalized to 0-1. No ML
 * segmentation/saliency model is available (Owner's spec section 4 allows
 * falling back to "edge strength + local contrast" in that case) — this is
 * the edge-strength half of that approximation.
 */
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

  const sorted = Float32Array.from(magnitude).sort();
  const normalizer = sorted[Math.floor((sorted.length - 1) * NORMALIZATION_PERCENTILE)] || 1;
  for (let i = 0; i < magnitude.length; i++) {
    magnitude[i] = Math.min(1, magnitude[i] / normalizer);
  }
  return magnitude;
}

/**
 * Per-cell importance (0-1), combining the max edge magnitude found inside
 * each stitch cell with the cell's own internal luminance contrast (a real
 * detail can sit *inside* one cell without producing a strong edge at its
 * boundary — the Owner's spec section 4 formula). Weighted 0.7/0.3 toward
 * edge strength: a real boundary is a stronger, less ambiguous signal than
 * raw contrast, which also fires on uniform photographic noise.
 */
export function computeCellImportance(
  source: PixelBuffer,
  edgeMagnitude: Float32Array,
  gridWidth: number,
  gridHeight: number
): Float32Array {
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
