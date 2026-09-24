import { describe, expect, it } from "vitest";
import { rgbToOklab } from "@/lib/color/color";
import { downsampleToGrid, gridDimensionsFor, VIVID_TOP_SHARE } from "@/lib/pipeline/downsample";
import { HUE_RESERVE_MAX_THREADS, hueBinOf, reserveHueThreads } from "@/lib/pipeline/hue-reserve";
import { buildPattern } from "@/lib/pipeline/pattern";
import { kMeansQuantizer } from "@/lib/pipeline/quantize";
import type { PixelBuffer, RGB } from "@/lib/types";
import { makeBuffer, pseudoNoise } from "./helpers/fixtures";
import { hashPattern } from "./helpers/pattern-hash";

/**
 * G-062: a thread for a hue the photo has. k-means allocates by squared error, so a colour covering half a percent
 * of a chart never wins a slot however visible it is; this takes one for it (D212).
 */

const chromaOf = (rgb: RGB) => {
  const [, a, b] = rgbToOklab(rgb);
  return Math.sqrt(a * a + b * b);
};
const hueOf = (rgb: RGB) => {
  const [, a, b] = rgbToOklab(rgb);
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
};

/**
 * A brown field carrying red thread-thin lines: the shape of every photo this exists for. The red is real and
 * visible, but no stitch is wholly red, so the cells a plain downsample hands the quantizer are muddy browns and it
 * has nothing to cluster on.
 */
function fieldWithRedDetail(): PixelBuffer {
  // 800x600 into a 100-stitch chart is 48 pixels a stitch, above Vivid's floor; the lines fill a quarter of each
  // stitch they cross, which is the share Vivid keeps.
  const W = 800;
  const H = 600;
  return makeBuffer(W, H, (x, y) => {
    const inLine = y >= 200 && y < 320 && x % 8 < 2;
    if (inLine) return [210, 30, 40];
    const ramp = (x / W) * 60;
    const n = pseudoNoise(x, y, 8);
    return [110 + ramp + n, 92 + ramp * 0.8 + n, 70 + ramp * 0.5 + n];
  });
}

/** Four flat colours, each covering a quarter of the frame: nothing rare, nothing to reserve. */
function flatRegions(): PixelBuffer {
  return makeBuffer(320, 240, (x, y) => {
    const base: RGB = x < 160 ? (y < 120 ? [200, 60, 60] : [60, 140, 90]) : y < 120 ? [70, 100, 190] : [220, 190, 70];
    const n = pseudoNoise(x, y, 6);
    return [base[0] + n, base[1] + n, base[2] + n];
  });
}

describe("reserving a thread for a hue the photo has", () => {
  it("gives a hue the chart would otherwise lose a thread of its own", () => {
    const source = fieldWithRedDetail();
    const options = { longerSideStitches: 100, colorCount: 8 } as const;

    const plain = buildPattern(source, options);
    const vivid = buildPattern(source, { ...options, vivid: true });

    // Plain finds a red-ish thread here — the average of the red lines and the brown they sit on. What changes is
    // how red it is: the reserved thread is seeded from the reddest cell rather than the average of a mixture.
    const reddest = (rgbs: RGB[]) => Math.max(0, ...rgbs.filter((rgb) => hueOf(rgb) < 40 || hueOf(rgb) >= 330).map(chromaOf));
    const plainRed = reddest(plain.palette.map((c) => c.rgb));
    const vividRed = reddest(vivid.palette.map((c) => c.rgb));
    expect(vividRed).toBeGreaterThan(1.5 * plainRed);
  });

  it("leaves a photo with nothing rare in it alone", () => {
    // Four flat colours, through the real quantizer: every hue is large and already spoken for, so there is nothing
    // to reserve and both the palette and the cells come back as they went in (criterion 3).
    const { width, height } = gridDimensionsFor(320, 240, 80);
    const cells = downsampleToGrid(flatRegions(), width, height, VIVID_TOP_SHARE);
    const oklab = new Float64Array(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      oklab.set(rgbToOklab([cells.data[i * 3], cells.data[i * 3 + 1], cells.data[i * 3 + 2]]), i * 3);
    }
    const quantized = kMeansQuantizer.quantize(cells, 16, undefined, oklab);

    const result = reserveHueThreads(oklab, quantized.cellPaletteIndex, quantized.palette);

    expect(result.reserved).toBe(0);
    expect(result.palette).toBe(quantized.palette);
    expect(result.cellPaletteIndex).toBe(quantized.cellPaletteIndex);
  });

  it("never reserves more than its cap, however many hues a photo holds", () => {
    // Every hue at once, each a twentieth of the frame, against a palette that speaks for none of them.
    const wheel = makeBuffer(320, 320, (x, y) => {
      const band = Math.floor((x / 320) * 10);
      const hues: RGB[] = [
        [220, 40, 40],
        [220, 130, 40],
        [210, 200, 40],
        [120, 200, 50],
        [40, 190, 90],
        [40, 190, 190],
        [40, 120, 220],
        [90, 60, 210],
        [170, 50, 200],
        [220, 50, 140],
      ];
      const n = pseudoNoise(x, y, 6);
      return [hues[band][0] + n, hues[band][1] + n, hues[band][2] + n];
    });
    const { width, height } = gridDimensionsFor(320, 320, 80);
    const cells = downsampleToGrid(wheel, width, height, VIVID_TOP_SHARE);
    const oklab = new Float64Array(width * height * 3);
    for (let i = 0; i < width * height; i++) {
      oklab.set(rgbToOklab([cells.data[i * 3], cells.data[i * 3 + 1], cells.data[i * 3 + 2]]), i * 3);
    }
    const greys: RGB[] = [
      [40, 40, 40],
      [110, 110, 110],
      [180, 180, 180],
      [240, 240, 240],
    ];
    const assignment = new Uint8Array(width * height);
    for (let i = 0; i < assignment.length; i++) assignment[i] = i % greys.length;

    const result = reserveHueThreads(oklab, assignment, greys);

    expect(result.reserved).toBe(HUE_RESERVE_MAX_THREADS);
    // The palette never grows: each reserved thread is paid for out of the palette it was given.
    expect(result.palette.length).toBeLessThanOrEqual(greys.length);
  });

  it("is off unless Vivid is on, and Vivid off is still the chart as it was", () => {
    const source = fieldWithRedDetail();
    const options = { longerSideStitches: 100, colorCount: 8 } as const;

    expect(hashPattern(buildPattern(source, { ...options, vivid: false }))).toBe(hashPattern(buildPattern(source, options)));
  });

  it("puts a cell in the bin its hue belongs to, and nothing outside the bins", () => {
    // Red near 0 degrees, and the bin count wraps rather than overflowing.
    const red = rgbToOklab([220, 40, 40]);
    const blue = rgbToOklab([40, 80, 220]);
    expect(hueBinOf(red[1], red[2])).toBe(0);
    expect(hueBinOf(blue[1], blue[2])).toBeGreaterThanOrEqual(7);
    for (const [a, b] of [
      [0, 0],
      [-0.1, 0],
      [0, -0.1],
      [1e-12, -1e-12],
    ]) {
      const bin = hueBinOf(a, b);
      expect(bin).toBeGreaterThanOrEqual(0);
      expect(bin).toBeLessThan(12);
    }
  });
});
