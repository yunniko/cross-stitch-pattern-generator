import { rgbToOklab } from "../color/color";
import { DEFAULT_DITHER_TEXTURE, handDrawnThresholds, handDrawnThresholdWindow, type DitherTexture } from "./dither-hand-drawn";
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

/** The line screens: one pattern with a direction, stored as four ids so files written before G-059 still open. */
export const LINE_DITHER_MODES = ["lines-horizontal", "lines-vertical", "lines-diagonal", "lines-anti-diagonal"] as const;
export type LineDitherMode = (typeof LINE_DITHER_MODES)[number];
export const ORDERED_DITHER_MODES = ["bayer-4", "bayer-8", "clustered-8", "ring-8", ...LINE_DITHER_MODES, "blue-noise-16"] as const;
export type OrderedDitherMode = (typeof ORDERED_DITHER_MODES)[number];
export const DIFFUSION_DITHER_MODES = ["floyd-steinberg", "atkinson"] as const;
/** Marks placed across the chart rather than a tile repeated or an error carried: the third family (G-054). */
export const DRAWN_DITHER_MODES = ["hand-drawn"] as const;
export const DITHER_MODES = ["off", ...ORDERED_DITHER_MODES, ...DIFFUSION_DITHER_MODES, ...DRAWN_DITHER_MODES] as const;
export type DiffusionDitherMode = (typeof DIFFUSION_DITHER_MODES)[number];
export type DitherMode = (typeof DITHER_MODES)[number];

export function isDithered(mode: DitherMode | undefined): mode is Exclude<DitherMode, "off"> {
  return mode !== undefined && mode !== "off";
}

/** Whether a pattern is one of the line screens, which the pane offers as a single option with a direction. */
export function isLinesMode(mode: DitherMode | undefined): mode is LineDitherMode {
  return mode !== undefined && (LINE_DITHER_MODES as readonly string[]).includes(mode);
}

/** Whether a pattern draws marks across the whole chart instead of repeating a tile or carrying an error. */
export function isDrawnMode(mode: DitherMode | undefined): mode is (typeof DRAWN_DITHER_MODES)[number] {
  return mode !== undefined && (DRAWN_DITHER_MODES as readonly string[]).includes(mode);
}

/** Whether a pattern carries the error to the stitches after it, rather than reading a threshold matrix. */
export function isDiffusionMode(mode: Exclude<DitherMode, "off">): mode is DiffusionDitherMode {
  return (DIFFUSION_DITHER_MODES as readonly string[]).includes(mode);
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
function orderedDither(cellOklab: Float64Array, width: number, height: number, palette: readonly RGB[], mode: OrderedDitherMode): Uint8Array {
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

/**
 * One label per cell from a threshold field covering the whole chart, rather than a tile repeated across it. The
 * decision is the ordered one — the field only says where each cell sits in its mark.
 */
function drawnDither(cellOklab: Float64Array, width: number, height: number, palette: readonly RGB[], texture: DitherTexture): Uint8Array {
  const thresholds = handDrawnThresholds(width, height, texture);
  const paletteOklab = paletteToOklab(palette);
  const labels = new Uint8Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const o = i * 3;
    const l = cellOklab[o];
    const a = cellOklab[o + 1];
    const b = cellOklab[o + 2];
    const [first, second] = twoNearest(paletteOklab, palette.length, l, a, b);
    const t = positionBetween(paletteOklab, first, second, l, a, b);
    labels[i] = t > thresholds[i] ? second : first;
  }
  return labels;
}

/**
 * The error-diffusion kernels, as `[dx, dy, weight]` taps ahead of the cell being decided. `dx` is mirrored on a
 * right-to-left row, so a serpentine scan spreads the error the same way in both directions.
 *
 * Floyd–Steinberg passes all of the error on. Atkinson passes only six eighths and drops the rest, which is what
 * gives it its look: the error never accumulates enough to break a near-black or near-white area, so the extremes
 * stay flat, and the stitches it does place clump (D200).
 */
const DIFFUSION_KERNELS: Record<DiffusionDitherMode, readonly (readonly [number, number, number])[]> = {
  "floyd-steinberg": [
    [1, 0, 7 / 16],
    [-1, 1, 3 / 16],
    [0, 1, 5 / 16],
    [1, 1, 1 / 16],
  ],
  atkinson: [
    [1, 0, 1 / 8],
    [2, 0, 1 / 8],
    [-1, 1, 1 / 8],
    [0, 1, 1 / 8],
    [1, 1, 1 / 8],
    [0, 2, 1 / 8],
  ],
};

/** One label per cell, each rounded to its nearest thread with the error carried to the stitches not yet decided. */
function errorDiffusionDither(cellOklab: Float64Array, width: number, height: number, palette: readonly RGB[], mode: DiffusionDitherMode): Uint8Array {
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
      for (const [dx, dy, weight] of DIFFUSION_KERNELS[mode]) spread(x + ahead * dx, y + dy, weight);
    }
  }
  return labels;
}

/** The tone the swatch's ramp shows at a row: dark at the top, light at the bottom, never quite either. */
export function drawnRampTone(row: number, height: number): number {
  return height <= 1 ? 0.5 : 0.15 + (0.7 * row) / (height - 1);
}

/**
 * What a chart of `chartWidth` × `chartHeight` would show in its top-left window, for a dark-to-light ramp between
 * two threads: the editor's swatch (G-057).
 *
 * It exists here, beside `ditherToPalette`, because the swatch has to make its stitches the way a chart does — the
 * same threshold field, and the same rule about which of the two nearest threads is the one being placed. A swatch
 * that compared a tone with a threshold directly looked right in the dark half and came out inverted in the light
 * half, where the nearer thread is the light one.
 */
export function drawnRampWindow(
  chartWidth: number,
  chartHeight: number,
  windowWidth: number,
  windowHeight: number,
  palette: readonly RGB[],
  texture: DitherTexture = DEFAULT_DITHER_TEXTURE
): { width: number; height: number; labels: Uint8Array } {
  const { width, height, thresholds } = handDrawnThresholdWindow(chartWidth, chartHeight, windowWidth, windowHeight, texture);
  const labels = new Uint8Array(width * height);
  if (palette.length < 2) return { width, height, labels };
  const paletteOklab = paletteToOklab(palette);
  const from = rgbToOklab(palette[0]);
  const to = rgbToOklab(palette[1]);

  for (let y = 0; y < height; y++) {
    const tone = drawnRampTone(y, height);
    const l = from[0] + tone * (to[0] - from[0]);
    const a = from[1] + tone * (to[1] - from[1]);
    const b = from[2] + tone * (to[2] - from[2]);
    const [first, second] = twoNearest(paletteOklab, palette.length, l, a, b);
    const t = positionBetween(paletteOklab, first, second, l, a, b);
    for (let x = 0; x < width; x++) labels[y * width + x] = t > thresholds[y * width + x] ? second : first;
  }
  return { width, height, labels };
}

/** Every cell's palette entry, dithered by `mode`. The palette is the quantizer's, unchanged. */
export function ditherToPalette(
  cellOklab: Float64Array,
  width: number,
  height: number,
  palette: readonly RGB[],
  mode: Exclude<DitherMode, "off">,
  texture: DitherTexture = DEFAULT_DITHER_TEXTURE
): Uint8Array {
  if (palette.length === 0) return new Uint8Array(width * height);
  if (isDiffusionMode(mode)) return errorDiffusionDither(cellOklab, width, height, palette, mode);
  if (isDrawnMode(mode)) return drawnDither(cellOklab, width, height, palette, texture);
  return orderedDither(cellOklab, width, height, palette, mode);
}
