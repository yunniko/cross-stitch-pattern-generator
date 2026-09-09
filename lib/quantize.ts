import type { RGB } from "./types";
import { rgbToLab, labDistanceSquared, type Lab } from "./color";

export interface QuantizeResult {
  /** One palette index per input cell, same order/length as the input. */
  cellPaletteIndex: Uint8Array;
  /** Representative RGB color for each palette entry, length k (or fewer if k > distinct colors). */
  palette: RGB[];
}

export interface ColorQuantizer {
  quantize(cellColors: RGB[], colorCount: number): QuantizeResult;
}

function meanRgb(colors: RGB[], indices: number[]): RGB {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const i of indices) {
    r += colors[i][0];
    g += colors[i][1];
    b += colors[i][2];
  }
  const n = indices.length || 1;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

/** Deterministic k-means++ seeding: spreads initial centroids apart instead of picking randomly. */
function kMeansPlusPlusSeeds(labColors: Lab[], k: number, rng: () => number): Lab[] {
  const seeds: Lab[] = [labColors[Math.floor(rng() * labColors.length)]];
  const distSq = new Float64Array(labColors.length).fill(Infinity);

  while (seeds.length < k) {
    let total = 0;
    for (let i = 0; i < labColors.length; i++) {
      const d = labDistanceSquared(labColors[i], seeds[seeds.length - 1]);
      if (d < distSq[i]) distSq[i] = d;
      total += distSq[i];
    }
    if (total === 0) {
      // All remaining points coincide with an existing seed; pad with duplicates.
      seeds.push(labColors[Math.floor(rng() * labColors.length)]);
      continue;
    }
    let threshold = rng() * total;
    let chosen = 0;
    for (let i = 0; i < labColors.length; i++) {
      threshold -= distSq[i];
      if (threshold <= 0) {
        chosen = i;
        break;
      }
    }
    seeds.push(labColors[chosen]);
  }
  return seeds;
}

/** Mulberry32 — small deterministic PRNG so quantization is reproducible for the same input. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MAX_ITERATIONS = 30;
const CONVERGENCE_THRESHOLD_SQ = 0.01;

/**
 * K-means clustering in CIELAB space (perceptually uniform, unlike raw RGB —
 * see HANDOVER.md D1 for why). Each cell has already been box-averaged by
 * `downsampleToGrid` before reaching here, so clustering never sees
 * single-pixel outliers. The reported palette color is the mean *RGB* of a
 * cluster's members, not the Lab centroid converted back to RGB — averaging
 * in RGB after clustering in Lab avoids gamut round-trip artifacts.
 */
export const kMeansLabQuantizer: ColorQuantizer = {
  quantize(cellColors: RGB[], colorCount: number): QuantizeResult {
    const k = Math.max(1, Math.min(colorCount, cellColors.length));
    const labColors = cellColors.map(rgbToLab);
    const rng = mulberry32(0xc0ffee ^ cellColors.length ^ k);

    let centroids = kMeansPlusPlusSeeds(labColors, k, rng);
    const assignments = new Uint8Array(cellColors.length);

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      for (let i = 0; i < labColors.length; i++) {
        let best = 0;
        let bestDist = Infinity;
        for (let c = 0; c < centroids.length; c++) {
          const d = labDistanceSquared(labColors[i], centroids[c]);
          if (d < bestDist) {
            bestDist = d;
            best = c;
          }
        }
        assignments[i] = best;
      }

      const sums = centroids.map(() => [0, 0, 0]);
      const counts = new Array(centroids.length).fill(0);
      for (let i = 0; i < labColors.length; i++) {
        const c = assignments[i];
        sums[c][0] += labColors[i][0];
        sums[c][1] += labColors[i][1];
        sums[c][2] += labColors[i][2];
        counts[c]++;
      }

      let maxShiftSq = 0;
      const newCentroids: Lab[] = centroids.map((old, c) => {
        if (counts[c] === 0) return old;
        const next: Lab = [sums[c][0] / counts[c], sums[c][1] / counts[c], sums[c][2] / counts[c]];
        maxShiftSq = Math.max(maxShiftSq, labDistanceSquared(old, next));
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
      palette.push(meanRgb(cellColors, indices));
    });

    const cellPaletteIndex = new Uint8Array(assignments.length);
    for (let i = 0; i < assignments.length; i++) {
      cellPaletteIndex[i] = remap[assignments[i]];
    }

    return { cellPaletteIndex, palette };
  },
};
