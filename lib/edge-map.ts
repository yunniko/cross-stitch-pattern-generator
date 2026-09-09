import { luminance } from "./color";
import type { PixelBuffer } from "./types";

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
  let maxMagnitude = 0;
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

      magnitude[y * width + x] = g;
      if (g > maxMagnitude) maxMagnitude = g;
    }
  }

  if (maxMagnitude > 0) {
    for (let i = 0; i < magnitude.length; i++) magnitude[i] /= maxMagnitude;
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
