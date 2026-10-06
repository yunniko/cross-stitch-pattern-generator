import { ditherRampWindow, DITHER_MODES, type DitherMode } from "@/lib/pipeline/dither";
import { DEFAULT_DITHER_TEXTURE, type DitherTexture } from "@/lib/pipeline/dither-hand-drawn";
import type { RGB } from "@/lib/types";

/**
 * G-100 M1: the dither previews as the app draws them before G-100, pinned as the reference that the previews made
 * by Rust are compared with, pixel for pixel (G-100's acceptance criteria).
 *
 * Two kinds of picture are drawn today. A tile in the chooser (`app/components/dither-chooser.tsx`) is the pattern over
 * a 24 × 24 ramp; the larger preview (`app/components/dither-preview.tsx`) is the 56 × 56 top-left corner of a chart of
 * the size in hand. A matrix's corner does not depend on the chart's size (D208), but a kernel's and the drawn marks'
 * do, so the preview is pinned at three chart sizes. The tones and sizes are the components' own.
 */

export const DARK: RGB = [29, 36, 48];
export const LIGHT: RGB = [242, 239, 230];
export const TILE = 24;
export const WINDOW = 56;

/** Chart sizes the larger preview is pinned at: the window itself, a small chart and a usual one. */
export const PREVIEW_CHARTS: ReadonlyArray<readonly [number, number]> = [
  [56, 56],
  [100, 70],
  [300, 200],
];

/** Drawn-marks textures beyond the default, from `dither-texture-swatch.spec.ts`'s range of shapes and spacing. */
export const DRAWN_TEXTURES: ReadonlyArray<readonly [string, DitherTexture]> = [
  ["seed-7", { ...DEFAULT_DITHER_TEXTURE, seed: 7 }],
  ["rings", { ...DEFAULT_DITHER_TEXTURE, shapeWeights: [0.8, 0.2, 0, 0, 0], sweep: 0.4 }],
  ["stipple", { ...DEFAULT_DITHER_TEXTURE, shapeWeights: [0, 0, 0.6, 0.4, 0], spacing: 4, wobble: 0.6 }],
  ["coarse", { ...DEFAULT_DITHER_TEXTURE, spacing: 11, radiusMin: 0.3, radiusSpan: 0.12 }],
];

export interface PreviewCase {
  name: string;
  mode: DitherMode;
  chartWidth: number;
  chartHeight: number;
  texture?: DitherTexture;
}

export const DITHERED_MODES = DITHER_MODES.filter((mode): mode is Exclude<DitherMode, "off"> => mode !== "off");

export function previewCases(): PreviewCase[] {
  const cases: PreviewCase[] = DITHER_MODES.map((mode) => ({ name: `tile/${mode}`, mode, chartWidth: TILE, chartHeight: TILE }));
  for (const mode of DITHERED_MODES) {
    for (const [chartWidth, chartHeight] of PREVIEW_CHARTS) {
      cases.push({ name: `preview/${mode}/${chartWidth}x${chartHeight}`, mode, chartWidth, chartHeight });
    }
  }
  for (const [label, texture] of DRAWN_TEXTURES) {
    for (const [chartWidth, chartHeight] of PREVIEW_CHARTS) {
      cases.push({
        name: `preview/hand-drawn-${label}/${chartWidth}x${chartHeight}`,
        mode: "hand-drawn",
        chartWidth,
        chartHeight,
        texture,
      });
    }
  }
  return cases;
}

/**
 * A case's picture as today's TypeScript draws it: one label per pixel, 1 the light tone. With dithering off, a tile is
 * the ramp cut where the nearer thread changes, as the chooser draws it.
 */
export function drawToday(c: PreviewCase): { width: number; height: number; labels: Uint8Array } {
  const window = c.name.startsWith("tile/") ? TILE : WINDOW;
  if (c.mode === "off") {
    return {
      width: TILE,
      height: TILE,
      labels: Uint8Array.from({ length: TILE * TILE }, (_, i) => (Math.floor(i / TILE) >= TILE / 2 ? 1 : 0)),
    };
  }
  return ditherRampWindow(c.chartWidth, c.chartHeight, window, window, [DARK, LIGHT], c.mode, c.texture);
}

/** Labels packed eight to a byte, most significant bit first, as base64; every label must be 0 or 1. */
export function packLabels(labels: Uint8Array): string {
  const bytes = new Uint8Array(Math.ceil(labels.length / 8));
  labels.forEach((label, i) => {
    if (label !== 0 && label !== 1) throw new Error(`label ${label} at ${i} is not one of the two tones`);
    if (label === 1) bytes[i >> 3] |= 0x80 >> (i & 7);
  });
  return Buffer.from(bytes).toString("base64");
}

export const REFERENCE_FILE = "tests/unit/fixtures/dither-previews.json";

export interface ReferencePicture {
  width: number;
  height: number;
  labels: string;
}
