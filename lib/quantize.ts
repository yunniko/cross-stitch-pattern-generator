import { linearToSrgb, oklabDistanceSquared, rgbToOklab, srgbToLinear, type Oklab } from "./color";
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
 */
export const kMeansQuantizer: ColorQuantizer = {
  quantize(cells: CellColorBuffer, colorCount: number): QuantizeResult {
    const cellCount = cells.width * cells.height;
    const k = Math.max(1, Math.min(colorCount, cellCount));
    const oklabColors = new Array<Oklab>(cellCount);
    for (let i = 0; i < cellCount; i++) oklabColors[i] = rgbToOklab(cellRgb(cells, i));

    const rng = mulberry32(0xc0ffee ^ cellCount ^ k);

    let centroids = kMeansPlusPlusSeeds(oklabColors, k, rng);
    const assignments = new Uint8Array(cellCount);

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

    const indicesByCluster: number[][] = centroids.map(() => []);
    for (let i = 0; i < assignments.length; i++) {
      indicesByCluster[assignments[i]].push(i);
    }

    // Drop clusters that ended up empty (can happen when k exceeds the
    // number of visually distinct colors) and remap indices to be contiguous.
    const remap = new Int16Array(centroids.length).fill(-1);
    const palette: RGB[] = [];
    indicesByCluster.forEach((indices, c) => {
      if (indices.length === 0) return;
      remap[c] = palette.length;
      palette.push(meanRgbLinear(cells, indices));
    });

    const cellPaletteIndex = new Uint8Array(assignments.length);
    for (let i = 0; i < assignments.length; i++) {
      cellPaletteIndex[i] = remap[assignments[i]];
    }

    return { cellPaletteIndex, palette };
  },
};
