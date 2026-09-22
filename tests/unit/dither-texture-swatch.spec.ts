import { describe, expect, it } from "vitest";
import { rgbToOklab } from "@/lib/color/color";
import { ditherToPalette } from "@/lib/pipeline/dither";
import { DEFAULT_DITHER_TEXTURE, handDrawnThresholds, type DitherTexture } from "@/lib/pipeline/dither-hand-drawn";
import type { RGB } from "@/lib/types";

/**
 * G-055 M3, criterion 5: the editor's swatch is drawn in the page and the chart on the server, so "they agree" is a
 * claim that has to be checked. The swatch lights a cell when `tone > threshold`; this pins that the chart does the
 * same thing for the same texture, at the swatch's own size and tone.
 */

const BLACK: RGB = [0, 0, 0];
const WHITE: RGB = [255, 255, 255];
const SWATCH = 56;
// The editor's own constant. Not round, on purpose: a round tone can equal a threshold exactly, and then the two
// paths disagree on that one cell depending on the last bit of the chart's projected tone (found by this test).
const SWATCH_TONE = 0.4237;

/** The swatch's rule, copied from `app/components/texture-editor.tsx` — the one line this test exists to pin. */
function swatch(texture: DitherTexture): Uint8Array {
  const thresholds = handDrawnThresholds(SWATCH, SWATCH, texture);
  return Uint8Array.from(thresholds, (threshold) => (SWATCH_TONE > threshold ? 1 : 0));
}

/** The same patch through the pipeline: a flat tone between two threads, dithered as a chart would be. */
function chart(texture: DitherTexture): Uint8Array {
  const black = rgbToOklab(BLACK);
  const white = rgbToOklab(WHITE);
  const grid = new Float64Array(SWATCH * SWATCH * 3);
  for (let i = 0; i < SWATCH * SWATCH; i++) {
    for (let c = 0; c < 3; c++) grid[i * 3 + c] = black[c] + SWATCH_TONE * (white[c] - black[c]);
  }
  return ditherToPalette(grid, SWATCH, SWATCH, [BLACK, WHITE], "hand-drawn", texture);
}

describe("the swatch shows what the chart will do", () => {
  const textures: Array<[string, DitherTexture]> = [
    ["default", DEFAULT_DITHER_TEXTURE],
    ["rings", { ...DEFAULT_DITHER_TEXTURE, shapeWeights: [0.8, 0.2, 0, 0, 0], sweep: 0.4 }],
    ["stipple", { ...DEFAULT_DITHER_TEXTURE, shapeWeights: [0, 0, 0.6, 0.4, 0], spacing: 4, wobble: 0.6 }],
    ["coarse", { ...DEFAULT_DITHER_TEXTURE, spacing: 11, radiusMin: 0.3, radiusSpan: 0.12 }],
    // A painted mark (G-056): the swatch must show what a stamped chart will do, clipping included.
    [
      "stamped",
      {
        ...DEFAULT_DITHER_TEXTURE,
        shapeWeights: [0.3, 0, 0.2, 0, 0.5],
        stamp: { size: 5, order: [0, 0, 1, 0, 0, 0, 2, 1, 2, 0, 1, 1, 1, 1, 1, 0, 2, 1, 2, 0, 0, 0, 1, 0, 0] },
      },
    ],
    [
      "stamped and clipped",
      { ...DEFAULT_DITHER_TEXTURE, spacing: 4, shapeWeights: [0, 0, 0, 0, 1], stamp: { size: 9, order: Array.from({ length: 81 }, (_, i) => (i % 4 === 0 ? 1 : 0)) } },
    ],
  ];
  for (const [name, texture] of textures) {
    it(`${name}: stitch for stitch`, () => {
      expect(Array.from(swatch(texture))).toEqual(Array.from(chart(texture)));
    });
  }
});
