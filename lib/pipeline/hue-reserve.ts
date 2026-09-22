import { oklabDistanceSquared, oklabToRgb, rgbToOklab, type Oklab } from "../color/color";
import { EMPTY_CELL, type RGB } from "../types";

/**
 * Vivid, part two (G-062, D212): a thread for a hue the photo has, whether or not it earns one by area.
 *
 * k-means allocates by squared error, so a colour covering half a percent of the chart loses to one more step in the
 * dominant ramp however visible it is — measured across G-060 and G-061, the cat photo's pink got no thread at all by
 * 64 colours under four different mechanisms. This one does not ask it to win that contest: each hue the cells hold
 * and the palette does not speak for takes a slot, paid for by merging the closest pair of threads — the two a
 * stitcher would least miss.
 *
 * Runs between the quantizer and everything else, on the same denoised cells the quantizer clustered.
 */

/** Hue bins around the circle. Twelve is coarse enough that two threads of one hue don't both count as coverage. */
export const HUE_BINS = 12;
/** A cell counts as coloured above this chroma; below it the hue of a near-neutral is noise. */
export const HUE_RESERVE_CHROMA_FLOOR = 0.02;
/** A bin earns a thread at this share of the stitched cells. */
export const HUE_RESERVE_MIN_SHARE = 0.001;
/** At most this many threads are reserved, so a chart keeps its tonal steps. */
export const HUE_RESERVE_MAX_THREADS = 6;

/**
 * A thread speaks for a hue only if it carries at least this share of the chroma the most colourful cell of that hue
 * has. A washed-out thread in the pink bin is not a pink thread — which is what made the cat's pink appear at 16 and
 * 24 colours and vanish again at 40, where the larger palette happened to put a near-neutral there. Comparing against
 * the bin's own best cell rather than a fixed chroma keeps a heavy, genuinely muted hue from claiming slots.
 */
export const HUE_RESERVE_COVERAGE_SHARE = 0.5;

/**
 * And it must be a colour in its own right. Below this chroma a thread reads as a neutral whatever bin it falls in,
 * so counting it as coverage is what let the cat's pink be "spoken for" by a thread nobody would call pink.
 */
export const HUE_RESERVE_COVERAGE_FLOOR = 0.03;

const FLOOR_SQUARED = HUE_RESERVE_CHROMA_FLOOR * HUE_RESERVE_CHROMA_FLOOR;
const COVERAGE_SHARE_SQUARED = HUE_RESERVE_COVERAGE_SHARE * HUE_RESERVE_COVERAGE_SHARE;
const COVERAGE_FLOOR_SQUARED = HUE_RESERVE_COVERAGE_FLOOR * HUE_RESERVE_COVERAGE_FLOOR;

export interface HueReserveResult {
  cellPaletteIndex: Uint8Array;
  palette: RGB[];
  /** How many threads were reserved; 0 means the inputs come back untouched. */
  reserved: number;
}

/** Squared chroma, so the floor and the "most colourful" comparisons never take a square root. */
function chromaSquared(l: number, a: number, b: number): number {
  return a * a + b * b;
}

/** Which of `HUE_BINS` a colour falls in. `Math.atan2` is bit-exact in both languages (fdlibm, as photo enhancement uses). */
export function hueBinOf(a: number, b: number): number {
  const turns = (Math.atan2(b, a) / (2 * Math.PI) + 1) % 1;
  return Math.min(HUE_BINS - 1, Math.floor(turns * HUE_BINS));
}

export function reserveHueThreads(
  cellOklab: Float64Array,
  cellPaletteIndex: Uint8Array,
  palette: RGB[],
  emptyMask?: Uint8Array | null
): HueReserveResult {
  const cellCount = cellPaletteIndex.length;
  if (palette.length < 2) return { cellPaletteIndex, palette, reserved: 0 };

  // What the cells hold: how much of each hue, and the most colourful cell carrying it.
  const binWeight = new Array<number>(HUE_BINS).fill(0);
  const binBest = new Array<number>(HUE_BINS).fill(-1);
  const binBestChroma = new Array<number>(HUE_BINS).fill(0);
  let stitched = 0;
  for (let i = 0; i < cellCount; i++) {
    if (emptyMask?.[i]) continue;
    stitched++;
    const l = cellOklab[i * 3];
    const a = cellOklab[i * 3 + 1];
    const b = cellOklab[i * 3 + 2];
    const chroma = chromaSquared(l, a, b);
    if (chroma < FLOOR_SQUARED) continue;
    const bin = hueBinOf(a, b);
    binWeight[bin]++;
    // Strictly greater, so the earliest cell wins a tie and the choice can't depend on iteration luck.
    if (chroma > binBestChroma[bin]) {
      binBestChroma[bin] = chroma;
      binBest[bin] = i;
    }
  }

  // Which of those the palette already speaks for, and how strongly.
  const oklab = palette.map(rgbToOklab);
  const binThreadChroma = new Array<number>(HUE_BINS).fill(0);
  for (const [, a, b] of oklab) {
    const chroma = chromaSquared(0, a, b);
    if (chroma < FLOOR_SQUARED) continue;
    const bin = hueBinOf(a, b);
    if (chroma > binThreadChroma[bin]) binThreadChroma[bin] = chroma;
  }
  const covered = binThreadChroma.map(
    (thread, bin) => thread >= COVERAGE_FLOOR_SQUARED && thread >= COVERAGE_SHARE_SQUARED * binBestChroma[bin]
  );

  const wanted: Array<{ bin: number; weight: number }> = [];
  for (let bin = 0; bin < HUE_BINS; bin++) {
    if (covered[bin] || binBest[bin] < 0) continue;
    if (binWeight[bin] < HUE_RESERVE_MIN_SHARE * stitched) continue;
    wanted.push({ bin, weight: binWeight[bin] });
  }
  // Heaviest hue first; a tie goes to the lower bin, so the order never depends on the sort's stability.
  wanted.sort((x, y) => (y.weight !== x.weight ? y.weight - x.weight : x.bin - y.bin));
  const taking = wanted.slice(0, HUE_RESERVE_MAX_THREADS);
  if (taking.length === 0) return { cellPaletteIndex, palette, reserved: 0 };

  const centroids: Oklab[] = oklab.map((c) => [c[0], c[1], c[2]]);
  const counts = new Array<number>(centroids.length).fill(0);
  for (let i = 0; i < cellCount; i++) {
    if (emptyMask?.[i]) continue;
    counts[cellPaletteIndex[i]]++;
  }

  for (const { bin } of taking) {
    // The slot is paid for by the closest pair in the palette: the two threads a stitcher would least miss.
    let pairI = 0;
    let pairJ = 1;
    let bestDist = Infinity;
    for (let i = 0; i < centroids.length; i++) {
      for (let j = i + 1; j < centroids.length; j++) {
        const d = oklabDistanceSquared(centroids[i], centroids[j]);
        if (d < bestDist) {
          bestDist = d;
          pairI = i;
          pairJ = j;
        }
      }
    }
    const loser = counts[pairI] <= counts[pairJ] ? pairI : pairJ;
    counts[loser === pairI ? pairJ : pairI] += counts[loser];
    const seed = binBest[bin];
    centroids[loser] = [cellOklab[seed * 3], cellOklab[seed * 3 + 1], cellOklab[seed * 3 + 2]];
    counts[loser] = 0;
  }

  // Each cell to its nearest thread, once. Re-converging Lloyd here loses every reserved hue: the seeded centroid
  // drifts back into the mass it was placed to escape (measured, `docs/reviews/2026-09-23-hue-reservation.md`).
  const assignment = new Uint8Array(cellCount);
  const used = new Array<number>(centroids.length).fill(0);
  for (let i = 0; i < cellCount; i++) {
    if (emptyMask?.[i]) {
      assignment[i] = EMPTY_CELL;
      continue;
    }
    const cell: Oklab = [cellOklab[i * 3], cellOklab[i * 3 + 1], cellOklab[i * 3 + 2]];
    let best = 0;
    let bestDist = Infinity;
    for (let c = 0; c < centroids.length; c++) {
      const d = oklabDistanceSquared(cell, centroids[c]);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    assignment[i] = best;
    used[best]++;
  }

  const remap = new Int16Array(centroids.length).fill(-1);
  const nextPalette: RGB[] = [];
  centroids.forEach((centroid, c) => {
    if (used[c] === 0) return;
    remap[c] = nextPalette.length;
    nextPalette.push(oklabToRgb(centroid));
  });
  const nextIndex = new Uint8Array(cellCount);
  for (let i = 0; i < cellCount; i++) {
    nextIndex[i] = assignment[i] === EMPTY_CELL ? EMPTY_CELL : remap[assignment[i]];
  }

  return { cellPaletteIndex: nextIndex, palette: nextPalette, reserved: taking.length };
}
