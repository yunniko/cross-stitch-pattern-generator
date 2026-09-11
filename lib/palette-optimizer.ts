import { oklabDistanceSquared, rgbToOklab } from "./color";
import type { RGB } from "./types";

export interface PaletteMergeResult {
  cellPaletteIndex: Uint8Array;
  palette: RGB[];
}

/** Default merge threshold in squared OKLab distance — tuned empirically (see tests) to catch near-duplicate colors without touching genuinely distinct ones. */
export const DEFAULT_MERGE_DISTANCE_SQUARED = 0.0004;

function find(parent: Int32Array, i: number): number {
  while (parent[i] !== i) {
    parent[i] = parent[parent[i]];
    i = parent[i];
  }
  return i;
}

/**
 * Global palette-size penalty (Owner's spec section 10): repeatedly merges
 * the closest pair of palette colors, less-used into more-used, as long as
 * they're within `mergeDistanceThreshold` of each other in OKLab space —
 * i.e. only when the resulting color error is small *by construction* of
 * the threshold, not evaluated per-merge. Keeps the palette from carrying
 * near-duplicate colors that a k-means run can produce when the requested
 * color count exceeds what the image actually needs.
 */
/**
 * `entryWeights` (optional, one entry per `cellPaletteIndex` position; G-024
 * M3, HANDOVER.md D60) generalizes "which color is more-used" from a raw
 * occurrence count to summed observation mass -- needed once a caller's
 * `cellPaletteIndex`-like array can represent weighted samples (a confident
 * boundary cell's two mode-samples, each carrying that mode's coverage,
 * rather than one guaranteed-weight-1 entry per grid cell). Omitting it
 * reproduces today's exact raw-count behavior (each entry counted as weight
 * 1) byte-for-byte -- verified directly, not assumed from the math.
 */
export function mergeSimilarColors(
  cellPaletteIndex: Uint8Array,
  palette: RGB[],
  mergeDistanceThreshold: number = DEFAULT_MERGE_DISTANCE_SQUARED,
  entryWeights?: number[]
): PaletteMergeResult {
  const oklab = palette.map(rgbToOklab);
  const counts = new Array(palette.length).fill(0);
  for (let i = 0; i < cellPaletteIndex.length; i++) counts[cellPaletteIndex[i]] += entryWeights ? entryWeights[i] : 1;

  const parent = new Int32Array(palette.length);
  for (let i = 0; i < palette.length; i++) parent[i] = i;
  const alive = new Array(palette.length).fill(true);

  for (;;) {
    let bestI = -1;
    let bestJ = -1;
    let bestDist = Infinity;
    for (let i = 0; i < palette.length; i++) {
      if (!alive[i]) continue;
      for (let j = i + 1; j < palette.length; j++) {
        if (!alive[j]) continue;
        const d = oklabDistanceSquared(oklab[i], oklab[j]);
        if (d < bestDist) {
          bestDist = d;
          bestI = i;
          bestJ = j;
        }
      }
    }

    if (bestI === -1 || bestDist >= mergeDistanceThreshold) break;

    const [loser, winner] = counts[bestI] <= counts[bestJ] ? [bestI, bestJ] : [bestJ, bestI];
    parent[loser] = winner;
    alive[loser] = false;
    counts[winner] += counts[loser];
  }

  const survivingIndices = palette.map((_, i) => i).filter((i) => alive[i]);
  const newIndexOf = new Int32Array(palette.length).fill(-1);
  survivingIndices.forEach((oldIndex, newIndex) => {
    newIndexOf[oldIndex] = newIndex;
  });

  const newPalette = survivingIndices.map((i) => palette[i]);
  const newCellPaletteIndex = new Uint8Array(cellPaletteIndex.length);
  for (let i = 0; i < cellPaletteIndex.length; i++) {
    const root = find(parent, cellPaletteIndex[i]);
    newCellPaletteIndex[i] = newIndexOf[root];
  }

  return { cellPaletteIndex: newCellPaletteIndex, palette: newPalette };
}
