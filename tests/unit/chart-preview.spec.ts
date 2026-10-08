import { describe, expect, it } from "vitest";
import { chartPreviewPng, previewPixels, previewStitchPx } from "@/lib/charts/preview";
import { readChartUpload } from "@/lib/charts/saved-charts";
import { PREVIEW_DRAWING, previewHref } from "@/lib/charts/saved-chart-link";
import { createBlankPattern } from "@/lib/editor/blank-pattern";
import { patternFromPixels } from "@/lib/editor/pixel-art-import";
import { serializePattern } from "@/lib/editor/pattern-serialize";
import { STITCH_BACKSLASH, STITCH_SLASH } from "@/lib/editor/stitch-kind";
import { halfStitchMask } from "@/lib/export/half-stitch-shape";
import { EMPTY_CELL, type PaletteColor, type PixelBuffer, type StitchPattern } from "@/lib/types";
import { readPng } from "./helpers/png-read";

/**
 * G-108 part 1 M6 (D357), G-119 (D362): a saved chart's or a stamp's preview is the chart in its own colours, each stitch a
 * few pixels square so half stitches and backstitch show, drawn on the server.
 */

/** The RGBA of pixel (x, y). */
function at(image: { data: ArrayLike<number>; width: number }, x: number, y: number): number[] {
  const i = (y * image.width + x) * 4;
  return Array.from({ length: 4 }, (_, c) => image.data[i + c]);
}

/** A thread of colour `rgb` at palette `index`. */
function thread(index: number, rgb: [number, number, number]): PaletteColor {
  return { index, rgb, symbol: String(index), name: `Thread ${index}`, count: 0 };
}

/** A `width` × `height` chart of one thread, every stitch whole. */
function filled(width: number, height: number): StitchPattern {
  const pattern = createBlankPattern(width, height, "Ink");
  pattern.palette = [thread(0, [10, 20, 30])];
  pattern.cellPalette.fill(0);
  return pattern;
}

/** 12 × 10 stitches: red on the left, blue on the right, an empty top-left corner. */
function picture(): PixelBuffer {
  const width = 12;
  const height = 10;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (x < 3 && y < 2) continue;
      data.set(x < 6 ? [200, 30, 40, 255] : [20, 60, 180, 255], i);
    }
  }
  return { data, width, height };
}

describe("a saved chart's preview", () => {
  it("is the chart read from the saved file, each stitch a square of its own colour, empty stitches transparent", async () => {
    const source = picture();
    const text = serializePattern(patternFromPixels(source, "Roses").pattern!);
    const read = readChartUpload(text);
    if ("error" in read) throw new Error(read.error);

    const png = readPng(await chartPreviewPng(read.pattern));

    const s = previewStitchPx(12, 10);
    expect([png.width, png.height]).toEqual([12 * s, 10 * s]);
    for (let y = 0; y < png.height; y++) {
      for (let x = 0; x < png.width; x++) {
        expect(at({ data: png.rgba, width: png.width }, x, y)).toEqual(at(source, Math.floor(x / s), Math.floor(y / s)));
      }
    }
  });

  it("of a chart with nothing stitched is wholly transparent", async () => {
    const png = readPng(await chartPreviewPng(createBlankPattern(30, 20, "Blank")));
    const s = previewStitchPx(30, 20);
    expect([png.width, png.height]).toEqual([30 * s, 20 * s]);
    expect(png.rgba.every((value) => value === 0)).toBe(true);
  });

  it("draws a stitch as many whole pixels as keep it near 512 pixels, between 1 and 16", () => {
    expect(previewStitchPx(12, 10)).toBe(16);
    expect(previewStitchPx(60, 40)).toBe(8);
    expect(previewStitchPx(200, 300)).toBe(1);
    expect(previewStitchPx(1000, 750)).toBe(1);
    expect(previewPixels(filled(1000, 750)).width).toBe(1000);
  });

  it("cuts a half stitch's corners as the Stitched view does", () => {
    const pattern = filled(10, 10);
    pattern.cellKind = new Uint8Array(100);
    pattern.cellKind.set([STITCH_SLASH, STITCH_BACKSLASH]);
    const image = previewPixels(pattern);
    const s = previewStitchPx(10, 10);
    for (const [cell, kind] of [STITCH_SLASH, STITCH_BACKSLASH].entries()) {
      const mask = halfStitchMask(kind, s);
      for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) expect(at(image, cell * s + x, y)[3]).toBe(mask[y * s + x]);
    }
    // "/" keeps its bottom-left and top-right corners and loses the other two; "\" the other way round.
    expect(at(image, 0, s - 1)[3]).toBe(255);
    expect(at(image, 0, 0)[3]).toBe(0);
    expect(at(image, s, 0)[3]).toBe(255);
    expect(at(image, 2 * s - 1, 0)[3]).toBe(0);
  });

  it("draws backstitch over the stitches and over empty canvas, a fifth of a stitch wide, in its thread's colour", () => {
    const pattern = createBlankPattern(10, 10, "Lines");
    pattern.palette = [thread(0, [200, 200, 200]), thread(1, [0, 0, 255])];

    pattern.cellPalette.fill(EMPTY_CELL);
    pattern.cellPalette.fill(0, 0, 50); // the top half stitched grey
    // A line down the middle, from the top edge to the bottom edge.
    pattern.backstitch = [{ x1: 5, y1: 0, x2: 5, y2: 10, paletteIndex: 1 }];
    const image = previewPixels(pattern);
    const s = previewStitchPx(10, 10);
    const middle = 5 * s;
    // On the line's centre, over stitches and over nothing alike: the thread, opaque.
    expect(at(image, middle, 2 * s)).toEqual([0, 0, 255, 255]);
    expect(at(image, middle - 1, 8 * s)).toEqual([0, 0, 255, 255]);
    // A stitch away from it: untouched.
    expect(at(image, middle + s, 2 * s)).toEqual([200, 200, 200, 255]);
    expect(at(image, middle + s, 8 * s)).toEqual([0, 0, 0, 0]);
    // The line's width: the columns it covers at all, a fifth of a stitch give or take its soft edge.
    const covered = Array.from({ length: image.width }, (_, x) => at(image, x, 8 * s)[3]).filter((alpha) => alpha > 0).length;
    expect(covered).toBeGreaterThanOrEqual(Math.floor(s / 5));
    expect(covered).toBeLessThanOrEqual(Math.ceil(s / 5) + 2);
  });

  it("draws a backstitch at least a pixel wide on a chart drawn a pixel a stitch", () => {
    const pattern = filled(600, 600);
    pattern.palette.push(thread(1, [255, 0, 0]));
    pattern.backstitch = [{ x1: 0, y1: 0, x2: 600, y2: 600, paletteIndex: 1 }];
    const image = previewPixels(pattern);
    expect(previewStitchPx(600, 600)).toBe(1);
    expect(at(image, 300, 300)[0]).toBeGreaterThan(100);
  });

  it("is asked for at the version listed and the current drawing, so each save and each new drawing is fetched afresh", () => {
    expect(previewHref("ckabc123", 4)).toBe(`/api/charts/ckabc123/preview?v=4.${PREVIEW_DRAWING}`);
  });
});
