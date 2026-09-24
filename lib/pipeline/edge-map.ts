import type { PixelBuffer } from "../types";

// Raw Sobel responses below this are sensor/JPEG noise, not an edge: i.i.d.
// noise of a few 8-bit levels reaches ~30-40 raw units with no structure
// (docs/domain-reference.md §6.3, D11).
const NOISE_FLOOR = 40;
// Normalizing by a high percentile rather than the single max: one outlier
// (a JPEG block edge, a specular highlight) would otherwise crush every
// real edge toward zero (D11).
const NORMALIZATION_PERCENTILE = 0.999;

/**
 * Every source pixel's `luminance` (0–255, an integer), computed once for the edge map and the cell importance, which
 * each used to convert the whole photo through a fresh tuple per pixel (G-047 M5). Same expression, same values.
 */
export function sourceLuminance(source: PixelBuffer): Uint8Array {
  const { width, height, data } = source;
  const gray = new Uint8Array(width * height);
  for (let i = 0, o = 0; i < gray.length; i++, o += 4) gray[i] = Math.round(0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]);
  return gray;
}

/**
 * Which source pixels are there at all: 1 where the photo is opaque, 0 where it is fully transparent, or null when the
 * photo is opaque throughout (G-050). A transparent pixel has no colour to read — the RGB behind alpha 0 is usually
 * black — so the stages below must not take one for content.
 */
export function opaquePixelMask(source: PixelBuffer): Uint8Array | null {
  const { width, height, data } = source;
  let mask: Uint8Array | null = null;
  for (let i = 0, o = 3; i < width * height; i++, o += 4) {
    if (data[o] !== 0) continue;
    mask ??= new Uint8Array(width * height).fill(1);
    mask[i] = 0;
  }
  return mask;
}

/**
 * Sobel gradient magnitude on source luminance, normalized to 0-1 by the 99.9th percentile. With `opaque`, a
 * transparent pixel has no magnitude of its own and lends its neighbours none: it is read as the centre pixel's own
 * luminance, so the alpha boundary itself is not mistaken for an edge in the photo (G-050).
 */
export function computeEdgeMagnitude(
  source: PixelBuffer,
  gray: ArrayLike<number> = sourceLuminance(source),
  opaque?: Uint8Array | null
): Float32Array {
  const { width, height } = source;

  const magnitude = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const xm1 = Math.max(0, x - 1);
      const xp1 = Math.min(width - 1, x + 1);
      const ym1 = Math.max(0, y - 1);
      const yp1 = Math.min(height - 1, y + 1);

      const centre = y * width + x;
      if (opaque && !opaque[centre]) {
        magnitude[centre] = 0;
        continue;
      }
      const at = opaque ? (index: number) => (opaque[index] ? gray[index] : gray[centre]) : (index: number) => gray[index];
      const tl = at(ym1 * width + xm1);
      const tc = at(ym1 * width + x);
      const tr = at(ym1 * width + xp1);
      const ml = at(y * width + xm1);
      const mr = at(y * width + xp1);
      const bl = at(yp1 * width + xm1);
      const bc = at(yp1 * width + x);
      const br = at(yp1 * width + xp1);

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
 *
 * Each cell reads the pixels its own footprint covers, `[ceil(c·src/grid), ceil((c+1)·src/grid))` (G-051). For a chart
 * no finer than the photo that is the exact inverse of the old `floor(x·grid/src)` assignment — the same pixels in the
 * same order, so the same sums to the last bit. For a finer chart the old mapping left whole cells with no pixel at
 * all, at importance 0 even along a strong edge; such a cell now reads the pixel its centre falls in.
 */
export function computeCellImportance(
  source: PixelBuffer,
  edgeMagnitude: Float32Array,
  gridWidth: number,
  gridHeight: number,
  gray: ArrayLike<number> = sourceLuminance(source),
  /** With a mask, a transparent pixel contributes neither edge nor contrast to its cell (G-050). */
  opaque?: Uint8Array | null
): Float32Array {
  const { width: srcW, height: srcH } = source;
  const importance = new Float32Array(gridWidth * gridHeight);

  /** The pixels of one axis this cell covers; the cell's centre pixel when its footprint holds none. */
  const span = (cell: number, cells: number, pixels: number): [number, number] => {
    const from = Math.ceil((cell * pixels) / cells);
    const to = Math.min(pixels, Math.ceil(((cell + 1) * pixels) / cells)) - 1;
    if (to >= from) return [from, to];
    const centre = Math.min(pixels - 1, Math.floor(((cell + 0.5) * pixels) / cells));
    return [centre, centre];
  };

  for (let cellY = 0; cellY < gridHeight; cellY++) {
    const [yFrom, yTo] = span(cellY, gridHeight, srcH);
    for (let cellX = 0; cellX < gridWidth; cellX++) {
      const [xFrom, xTo] = span(cellX, gridWidth, srcW);

      let maxEdge = 0;
      let sum = 0;
      let sumSq = 0;
      let count = 0;
      for (let y = yFrom; y <= yTo; y++) {
        for (let x = xFrom; x <= xTo; x++) {
          const srcIndex = y * srcW + x;
          if (opaque && !opaque[srcIndex]) continue;
          if (edgeMagnitude[srcIndex] > maxEdge) maxEdge = edgeMagnitude[srcIndex];
          const l = gray[srcIndex] / 255;
          sum += l;
          sumSq += l * l;
          count++;
        }
      }

      const n = count || 1;
      const mean = sum / n;
      const variance = Math.max(0, sumSq / n - mean * mean);
      // stdev of a 0-1 signal maxes out at 0.5 (half-black/half-white split); normalize accordingly.
      const contrast = Math.min(1, Math.sqrt(variance) / 0.5);
      importance[cellY * gridWidth + cellX] = Math.min(1, 0.7 * maxEdge + 0.3 * contrast);
    }
  }
  return importance;
}

/** Approximate edge strength across a specific cell-to-cell boundary, from each side's own importance. */
export function edgeBetweenCells(importance: Float32Array, i: number, j: number): number {
  return Math.max(importance[i], importance[j]);
}
