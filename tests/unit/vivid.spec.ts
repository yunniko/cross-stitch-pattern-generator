import { describe, expect, it } from "vitest";
import { rgbToOklab } from "@/lib/color/color";
import { deserializePatternData, serializePattern } from "@/lib/editor/pattern-serialize";
import { downsampleToGrid, gridDimensionsFor, VIVID_MIN_PIXELS_PER_CELL, VIVID_TOP_SHARE, vividApplies } from "@/lib/pipeline/downsample";
import { buildPattern } from "@/lib/pipeline/pattern";
import type { PixelBuffer, RGB } from "@/lib/types";
import { makeBuffer } from "./helpers/fixtures";
import { hashPattern } from "./helpers/pattern-hash";

/**
 * G-061: Vivid. A stitch covers many pixels; averaging them turns a small saturated thing inside one stitch into a
 * neutral, and the colour is then gone before any palette is chosen. Vivid keeps the mean's lightness and the chroma
 * of the cell's most colourful quarter (D211).
 *
 * What it does *not* do is make the Owner's photos deliver their pinks early — measured in
 * `docs/reviews/2026-09-22-vivid.md`. These tests pin the mechanism, not a claim about photos.
 */

const chromaOf = (rgb: RGB) => {
  const [, a, b] = rgbToOklab(rgb);
  return Math.sqrt(a * a + b * b);
};

/**
 * A grey field with a red patch inside every cell: exactly the case averaging destroys. The patch is a quarter of
 * each cell's area, which is the share Vivid keeps, so these tests state the mechanism rather than a tuning.
 */
function specksOnGrey(width: number, height: number, cellPixels: number): PixelBuffer {
  const side = Math.max(1, Math.floor(cellPixels / 2));
  return makeBuffer(width, height, (x, y) => (x % cellPixels < side && y % cellPixels < side ? [220, 30, 40] : [140, 140, 140]));
}

describe("Vivid", () => {
  it("keeps the colour of a speck that averaging turns grey", () => {
    const source = specksOnGrey(320, 320, 8);
    const { width, height } = gridDimensionsFor(320, 320, 40);

    const averaged = downsampleToGrid(source, width, height);
    const vivid = downsampleToGrid(source, width, height, VIVID_TOP_SHARE);

    const chromaOfCell = (cells: typeof averaged, i: number) => chromaOf([cells.data[i * 3], cells.data[i * 3 + 1], cells.data[i * 3 + 2]]);
    // The middle of the field, away from any edge effects. Measured: the average of a quarter red and three
    // quarters grey carries chroma 0.051; keeping the red quarter's own colour carries 0.164, the red's own.
    const middle = Math.floor((height / 2) * width + width / 2);
    expect(chromaOfCell(averaged, middle)).toBeLessThan(0.06);
    expect(chromaOfCell(vivid, middle)).toBeGreaterThan(0.14);
    expect(chromaOfCell(vivid, middle)).toBeGreaterThan(2 * chromaOfCell(averaged, middle));
  });

  it("leaves a cell of one flat colour exactly as it was", () => {
    // Every pixel equally colourful, so the most colourful quarter is the whole cell and the mean is its own answer.
    const source = makeBuffer(320, 320, () => [200, 60, 60]);
    const { width, height } = gridDimensionsFor(320, 320, 40);

    expect(Array.from(downsampleToGrid(source, width, height, VIVID_TOP_SHARE).data)).toEqual(
      Array.from(downsampleToGrid(source, width, height).data)
    );
  });

  it("keeps the area mean's lightness, and only moves the colour", () => {
    const source = specksOnGrey(320, 320, 8);
    const { width, height } = gridDimensionsFor(320, 320, 40);
    const averaged = downsampleToGrid(source, width, height);
    const vivid = downsampleToGrid(source, width, height, VIVID_TOP_SHARE);

    for (let i = 0; i < width * height; i++) {
      const before = rgbToOklab([averaged.data[i * 3], averaged.data[i * 3 + 1], averaged.data[i * 3 + 2]])[0];
      const after = rgbToOklab([vivid.data[i * 3], vivid.data[i * 3 + 1], vivid.data[i * 3 + 2]])[0];
      // Not exact: the colour is gamut-mapped back into sRGB, which can cost a little lightness at high chroma.
      expect(Math.abs(after - before)).toBeLessThan(0.02);
    }
  });

  it("stands down when a stitch covers too few pixels to tell colour from noise", () => {
    // 60x60 into a 40-stitch chart is about 2 pixels a cell: below the floor, so Vivid must change nothing.
    const source = specksOnGrey(60, 60, 4);
    const { width, height } = gridDimensionsFor(60, 60, 40);
    expect(vividApplies(60, 60, width, height)).toBe(false);

    expect(Array.from(downsampleToGrid(source, width, height, VIVID_TOP_SHARE).data)).toEqual(
      Array.from(downsampleToGrid(source, width, height).data)
    );
  });

  it("applies exactly at the measured floor and not below it", () => {
    // The floor is pixels per cell, so a square photo into a square grid states it directly.
    const pixels = Math.ceil(Math.sqrt(VIVID_MIN_PIXELS_PER_CELL)) * 10;
    expect(vividApplies(pixels, pixels, 10, 10)).toBe(true);
    expect(vividApplies(10, 10, 10, 10)).toBe(false);
  });

  it("is off by default, and off is the chart as it was", () => {
    const source = specksOnGrey(320, 320, 8);
    const options = { longerSideStitches: 40, colorCount: 8 } as const;

    expect(hashPattern(buildPattern(source, { ...options, vivid: false }))).toBe(hashPattern(buildPattern(source, options)));
  });

  it("records itself on the chart only when it acted, and travels with the file", () => {
    const big = specksOnGrey(320, 320, 8);
    const small = specksOnGrey(60, 60, 4);

    const acted = buildPattern(big, { longerSideStitches: 40, colorCount: 8, vivid: true });
    expect(acted.vivid).toBe(true);
    // Asked for, but the photo gives a stitch too few pixels: the chart says what happened, not what was asked.
    expect(buildPattern(small, { longerSideStitches: 40, colorCount: 8, vivid: true }).vivid).toBeUndefined();
    expect(buildPattern(big, { longerSideStitches: 40, colorCount: 8 }).vivid).toBeUndefined();

    const restored = deserializePatternData(JSON.parse(serializePattern(acted)));
    expect(restored.vivid).toBe(true);
    expect(Array.from(restored.cellPalette)).toEqual(Array.from(acted.cellPalette));
    // A file from before G-061, and a file carrying nonsense, both read as off rather than failing to open.
    const older = JSON.parse(serializePattern(buildPattern(big, { longerSideStitches: 40, colorCount: 8 })));
    expect(older.vivid).toBeUndefined();
    expect(deserializePatternData({ ...JSON.parse(serializePattern(acted)), vivid: "yes" }).vivid).toBeUndefined();
  });

  it("reaches a dithered chart too, which is upstream of everything dithering skips", () => {
    const source = specksOnGrey(320, 320, 8);
    const options = { longerSideStitches: 40, colorCount: 8, ditherMode: "floyd-steinberg" } as const;

    const off = buildPattern(source, options);
    const on = buildPattern(source, { ...options, vivid: true });

    expect(on.vivid).toBe(true);
    expect(hashPattern(on)).not.toBe(hashPattern(off));
  });
});
