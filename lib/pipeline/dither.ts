import { rgbToOklab } from "../color/color";
import { DITHER_MATRICES } from "./dither-matrices";
import type { RGB } from "../types";

/**
 * Dithering a chart to its palette (G-052): instead of rounding every stitch to its nearest thread, neighbouring
 * stitches take the two threads either side of the colour, so their mixture reads as the shade in between. It is the
 * cross-stitch technique of the same name, and it buys gradients a small palette cannot hold — at the cost of
 * confetti, which the Owner accepted (2026-09-21). See `docs/reviews/2026-09-21-dithering-research.md`.
 *
 * Two families, as the research found them:
 * - **Threshold matrix** (every mode but the last): each stitch compares its position between the two nearest threads
 *   against a repeating matrix. The matrix is the pattern — Bayer, a clustered dot screen, line screens, blue noise —
 *   and adding another is data, not code (D198).
 * - **Error diffusion** (`floyd-steinberg`): round each stitch, then push the colour error onto the stitches not yet
 *   decided, so it averages out over an area. Serpentine, which is what stops the worm artifacts the plain
 *   left-to-right scan makes.
 *
 * Everything works in OKLab, the space the rest of the pipeline compares colours in.
 */

export const ORDERED_DITHER_MODES = ["bayer-4", "bayer-8", "clustered-8", "lines-horizontal", "lines-diagonal", "blue-noise-16"] as const;
export const DITHER_MODES = ["off", ...ORDERED_DITHER_MODES, "floyd-steinberg"] as const;
export type DitherMode = (typeof DITHER_MODES)[number];

export function isDithered(mode: DitherMode | undefined): mode is Exclude<DitherMode, "off"> {
  return mode !== undefined && mode !== "off";
}

/** The two nearest palette entries to a colour, nearest first. With one entry both are it. */
function twoNearest(paletteOklab: Float64Array, count: number, l: number, a: number, b: number): [number, number] {
  let best = 0;
  let bestDist = Infinity;
  let second = 0;
  let secondDist = Infinity;
  for (let c = 0; c < count; c++) {
    const o = c * 3;
    const dl = l - paletteOklab[o];
    const da = a - paletteOklab[o + 1];
    const db = b - paletteOklab[o + 2];
    const d = dl * dl + da * da + db * db;
    if (d < bestDist) {
      secondDist = bestDist;
      second = best;
      bestDist = d;
      best = c;
    } else if (d < secondDist) {
      secondDist = d;
      second = c;
    }
  }
  return [best, secondDist === Infinity ? best : second];
}

/** Interleaved OKLab of a palette. */
function paletteToOklab(palette: readonly RGB[]): Float64Array {
  const out = new Float64Array(palette.length * 3);
  palette.forEach((rgb, i) => {
    const [l, a, b] = rgbToOklab(rgb);
    out[i * 3] = l;
    out[i * 3 + 1] = a;
    out[i * 3 + 2] = b;
  });
  return out;
}

/**
 * Where a colour sits between two palette entries: 0 at the first, 1 at the second, clamped. This is what the
 * threshold decides between, and it is why an unevenly spaced palette — a thread line — dithers correctly here: the
 * mixture is measured between the two threads that actually bracket the colour, not against an assumed even ramp.
 */
function positionBetween(paletteOklab: Float64Array, first: number, second: number, l: number, a: number, b: number): number {
  const fo = first * 3;
  const so = second * 3;
  const vl = paletteOklab[so] - paletteOklab[fo];
  const va = paletteOklab[so + 1] - paletteOklab[fo + 1];
  const vb = paletteOklab[so + 2] - paletteOklab[fo + 2];
  const lengthSquared = vl * vl + va * va + vb * vb;
  if (lengthSquared === 0) return 0;
  const t = ((l - paletteOklab[fo]) * vl + (a - paletteOklab[fo + 1]) * va + (b - paletteOklab[fo + 2]) * vb) / lengthSquared;
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

/** One label per cell, from the matrix named by `mode`. */
function orderedDither(cellOklab: Float64Array, width: number, height: number, palette: readonly RGB[], mode: Exclude<DitherMode, "off" | "floyd-steinberg">): Uint8Array {
  const matrix = DITHER_MATRICES[mode];
  if (!matrix) throw new Error(`Unknown dither pattern "${mode}".`);
  const size = matrix.length;
  const scale = size * size;
  const paletteOklab = paletteToOklab(palette);
  const labels = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const o = i * 3;
      const l = cellOklab[o];
      const a = cellOklab[o + 1];
      const b = cellOklab[o + 2];
      const [first, second] = twoNearest(paletteOklab, palette.length, l, a, b);
      const t = positionBetween(paletteOklab, first, second, l, a, b);
      // The rank's midpoint, so a tone of exactly 0.5 splits the matrix evenly instead of favouring one side.
      const threshold = (matrix[y % size][x % size] + 0.5) / scale;
      labels[i] = t > threshold ? second : first;
    }
  }
  return labels;
}

/** Floyd–Steinberg's weights, in scan order for the row being left and the row below. */
const FS_WEIGHTS = { ahead: 7 / 16, belowBack: 3 / 16, below: 5 / 16, belowAhead: 1 / 16 };

/** One label per cell, each rounded to its nearest thread with the error carried to the stitches not yet decided. */
function errorDiffusionDither(cellOklab: Float64Array, width: number, height: number, palette: readonly RGB[]): Uint8Array {
  const paletteOklab = paletteToOklab(palette);
  const labels = new Uint8Array(width * height);
  // A working copy, because a cell's colour is its own plus whatever error reached it.
  const working = Float64Array.from(cellOklab);

  for (let y = 0; y < height; y++) {
    // Serpentine: every other row runs right to left, which breaks up the worms a one-way scan leaves behind.
    const leftToRight = y % 2 === 0;
    for (let step = 0; step < width; step++) {
      const x = leftToRight ? step : width - 1 - step;
      const i = y * width + x;
      const o = i * 3;
      const [best] = twoNearest(paletteOklab, palette.length, working[o], working[o + 1], working[o + 2]);
      labels[i] = best;
      const po = best * 3;
      const el = working[o] - paletteOklab[po];
      const ea = working[o + 1] - paletteOklab[po + 1];
      const eb = working[o + 2] - paletteOklab[po + 2];

      const spread = (nx: number, ny: number, weight: number) => {
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) return;
        const no = (ny * width + nx) * 3;
        working[no] += el * weight;
        working[no + 1] += ea * weight;
        working[no + 2] += eb * weight;
      };
      const ahead = leftToRight ? 1 : -1;
      spread(x + ahead, y, FS_WEIGHTS.ahead);
      spread(x - ahead, y + 1, FS_WEIGHTS.belowBack);
      spread(x, y + 1, FS_WEIGHTS.below);
      spread(x + ahead, y + 1, FS_WEIGHTS.belowAhead);
    }
  }
  return labels;
}

/** Every cell's palette entry, dithered by `mode`. The palette is the quantizer's, unchanged. */
export function ditherToPalette(
  cellOklab: Float64Array,
  width: number,
  height: number,
  palette: readonly RGB[],
  mode: Exclude<DitherMode, "off">
): Uint8Array {
  if (palette.length === 0) return new Uint8Array(width * height);
  return mode === "floyd-steinberg" ? errorDiffusionDither(cellOklab, width, height, palette) : orderedDither(cellOklab, width, height, palette, mode);
}
