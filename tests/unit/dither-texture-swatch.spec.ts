import { describe, expect, it } from "vitest";
import { rgbToOklab } from "@/lib/color/color";
import { ditherToPalette, drawnRampTone, drawnRampWindow } from "@/lib/pipeline/dither";
import { DEFAULT_DITHER_TEXTURE, handDrawnThresholds, handDrawnThresholdWindow, type DitherTexture } from "@/lib/pipeline/dither-hand-drawn";
import type { RGB } from "@/lib/types";

/**
 * G-057: the editor's swatch is a corner of the chart the settings would produce, not a small chart of its own.
 *
 * The distinction is not academic, and G-055's version of this test missed it twice over. Marks are placed by walking
 * a jittered lattice across the whole grid, and each mark's shape is then drawn from what is left of the same random
 * stream, so both depend on the grid's full size: 46% of a 56-wide swatch's stitches differed from the same corner
 * of a 200×125 chart. The old test compared the swatch with a chart of the swatch's own size — the one case where
 * they agree. It also compared a tone against a threshold directly, which is only the pipeline's rule while the dark
 * thread is the nearer one; in the light half the two nearest swap and the marks inverted.
 */

const DARK: RGB = [29, 36, 48];
const LIGHT: RGB = [242, 239, 230];
const WINDOW = 56;

const TEXTURES: Array<[string, DitherTexture]> = [
  ["default", DEFAULT_DITHER_TEXTURE],
  ["rings", { ...DEFAULT_DITHER_TEXTURE, shapeWeights: [0.8, 0.2, 0, 0, 0], sweep: 0.4 }],
  ["stipple", { ...DEFAULT_DITHER_TEXTURE, shapeWeights: [0, 0, 0.6, 0.4, 0], spacing: 4, wobble: 0.6 }],
  ["coarse", { ...DEFAULT_DITHER_TEXTURE, spacing: 11, radiusMin: 0.3, radiusSpan: 0.12 }],
  [
    "stamped",
    {
      ...DEFAULT_DITHER_TEXTURE,
      shapeWeights: [0.3, 0, 0.2, 0, 0.5],
      stamp: { size: 5, order: [0, 0, 1, 0, 0, 0, 2, 1, 2, 0, 1, 1, 1, 1, 1, 0, 2, 1, 2, 0, 0, 0, 1, 0, 0] },
    },
  ],
];

/**
 * A real chart of `width` × `height` whose first `rampRows` rows carry the swatch's ramp. The rest carry its last
 * tone — they exist so the chart is the size the swatch claims to be a corner of, which is the whole point: the
 * field a chart draws with depends on its full size.
 */
function chartOfTheRamp(width: number, height: number, rampRows: number, texture: DitherTexture): Uint8Array {
  const from = rgbToOklab(DARK);
  const to = rgbToOklab(LIGHT);
  const grid = new Float64Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    const tone = drawnRampTone(Math.min(y, rampRows - 1), rampRows);
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < 3; c++) grid[(y * width + x) * 3 + c] = from[c] + tone * (to[c] - from[c]);
    }
  }
  return ditherToPalette(grid, width, height, [DARK, LIGHT], "hand-drawn", texture);
}

describe("the swatch is a corner of the chart the settings would make", () => {
  for (const [name, texture] of TEXTURES) {
    it(`${name}: the swatch's stitches are the chart's own`, () => {
      // The chart is taller and wider than the window, so this is the real case: a corner of something bigger.
      const chartWidth = 200;
      const chartHeight = 125;
      const swatch = drawnRampWindow(chartWidth, chartHeight, WINDOW, WINDOW, [DARK, LIGHT], texture);
      const chart = chartOfTheRamp(chartWidth, chartHeight, swatch.height, texture);
      let differ = 0;
      for (let y = 0; y < swatch.height; y++) {
        for (let x = 0; x < swatch.width; x++) {
          if (swatch.labels[y * swatch.width + x] !== chart[y * chartWidth + x]) differ++;
        }
      }
      expect(differ, `${name}: the swatch and the chart disagree`).toBe(0);
    });
  }

  it("takes its field from the chart's own size, not the window's", () => {
    // The bug this goal exists for: a window built at its own size agrees with nothing but itself.
    const texture = DEFAULT_DITHER_TEXTURE;
    const fromChart = handDrawnThresholdWindow(200, 125, WINDOW, WINDOW, texture);
    const full = handDrawnThresholds(200, 125, texture);
    for (let y = 0; y < WINDOW; y++) {
      for (let x = 0; x < WINDOW; x++) {
        expect(fromChart.thresholds[y * WINDOW + x], `${x},${y}`).toBe(full[y * 200 + x]);
      }
    }

    const fromItself = handDrawnThresholdWindow(WINDOW, WINDOW, WINDOW, WINDOW, texture);
    let differ = 0;
    for (let i = 0; i < WINDOW * WINDOW; i++) if (fromItself.thresholds[i] !== fromChart.thresholds[i]) differ++;
    expect(differ, "a window of its own size is a different pattern, which is why this goal exists").toBeGreaterThan(WINDOW * WINDOW * 0.2);
  });

  it("shows a chart smaller than the window as far as it goes", () => {
    const swatch = drawnRampWindow(30, 20, WINDOW, WINDOW, [DARK, LIGHT], DEFAULT_DITHER_TEXTURE);
    expect(swatch.width).toBe(30);
    expect(swatch.height).toBe(20);
    expect(Array.from(swatch.labels)).toEqual(Array.from(chartOfTheRamp(30, 20, swatch.height, DEFAULT_DITHER_TEXTURE)));
  });
});
