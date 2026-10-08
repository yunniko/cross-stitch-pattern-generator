import { describe, expect, it } from "vitest";
import { chartPreviewPng } from "@/lib/charts/preview";
import { readChartUpload } from "@/lib/charts/saved-charts";
import { previewHref } from "@/lib/charts/saved-chart-link";
import { createBlankPattern } from "@/lib/editor/blank-pattern";
import { patternFromPixels } from "@/lib/editor/pixel-art-import";
import { serializePattern } from "@/lib/editor/pattern-serialize";
import type { PixelBuffer } from "@/lib/types";
import { readPng } from "./helpers/png-read";

/** G-108 part 1 M6 (D357): a saved chart's preview is the chart in its own colours, one pixel per stitch, drawn on the server. */

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
  it("is the chart read from the saved file, one pixel per stitch in its own colours, empty stitches transparent", async () => {
    const source = picture();
    const text = serializePattern(patternFromPixels(source, "Roses").pattern!);
    const read = readChartUpload(text);
    if ("error" in read) throw new Error(read.error);

    const png = readPng(await chartPreviewPng(read.pattern));

    expect([png.width, png.height]).toEqual([12, 10]);
    expect(Array.from(png.rgba)).toEqual(Array.from(source.data));
  });

  it("of a chart with nothing stitched is wholly transparent", async () => {
    const png = readPng(await chartPreviewPng(createBlankPattern(30, 20, "Blank")));
    expect([png.width, png.height]).toEqual([30, 20]);
    expect(png.rgba.every((value) => value === 0)).toBe(true);
  });

  it("is asked for at the version listed, so each save is fetched afresh", () => {
    expect(previewHref("ckabc123", 4)).toBe("/api/charts/ckabc123/preview?v=4");
  });
});
