import { describe, expect, it } from "vitest";
import { DEFAULT_PIXEL_ART_NAME, patternFromPixels, pixelArtNameFromFileName } from "@/lib/editor/pixel-art-import";
import { EMPTY_CELL, MAX_COLORS, MAX_STITCHES, MIN_STITCHES, type PixelBuffer, type RGB } from "@/lib/types";

/** An image from rows of colours, where `null` is a fully transparent pixel. */
function image(rows: (RGB | null)[][]): PixelBuffer {
  const height = rows.length;
  const width = rows[0].length;
  const data = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, y) =>
    row.forEach((rgb, x) => {
      const i = (y * width + x) * 4;
      if (!rgb) return;
      data.set([rgb[0], rgb[1], rgb[2], 255], i);
    })
  );
  return { data, width, height };
}

/** A `width` × `height` image of `colors`, cycling through them, every pixel opaque. */
function filled(width: number, height: number, colors: RGB[]): PixelBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let cell = 0; cell < width * height; cell++) {
    const rgb = colors[cell % colors.length];
    data.set([rgb[0], rgb[1], rgb[2], 255], cell * 4);
  }
  return { data, width, height };
}

const BLACK: RGB = [0, 0, 0];
const WHITE: RGB = [255, 255, 255];
const RED: RGB = [220, 40, 40];

describe("pixel art becomes a chart, one pixel per stitch", () => {
  it("maps every pixel to the stitch at the same position", () => {
    const result = patternFromPixels(image([
      [BLACK, WHITE, RED, BLACK, WHITE, RED, BLACK, WHITE, RED, BLACK],
      [WHITE, RED, BLACK, WHITE, RED, BLACK, WHITE, RED, BLACK, WHITE],
      ...Array.from({ length: 8 }, () => Array.from({ length: 10 }, () => RED)),
    ]));
    expect(result.error).toBeNull();
    const pattern = result.pattern!;
    expect([pattern.width, pattern.height]).toEqual([10, 10]);
    // Dark to light, as a generated palette is ordered.
    expect(pattern.palette.map((c) => c.rgb)).toEqual([BLACK, RED, WHITE]);
    // 4 + 3 black in the two mixed rows, 3 + 4 white, and the rest red (3 + 3 + eight full rows).
    expect(pattern.palette.map((c) => c.count)).toEqual([7, 86, 7]);
    expect(new Set(pattern.palette.map((c) => c.symbol)).size).toBe(3);
    expect(new Set(pattern.palette.map((c) => c.name)).size).toBe(3);
    // The first row, read back as colours, is the first row of the image.
    const rgbOf = (x: number, y: number) => pattern.palette[pattern.cellPalette[y * pattern.width + x]].rgb;
    expect([rgbOf(0, 0), rgbOf(1, 0), rgbOf(2, 0)]).toEqual([BLACK, WHITE, RED]);
    expect(rgbOf(0, 1)).toEqual(WHITE);
  });

  it("makes a transparent pixel an empty stitch, counted for no colour", () => {
    const rows = Array.from({ length: 10 }, () => Array.from({ length: 10 }, (): RGB | null => RED));
    rows[0][0] = null;
    rows[9][9] = null;
    const pattern = patternFromPixels(image(rows)).pattern!;
    expect(pattern.cellPalette[0]).toBe(EMPTY_CELL);
    expect(pattern.cellPalette[99]).toBe(EMPTY_CELL);
    expect(pattern.palette[0].count).toBe(98);
  });

  it("carries no photo, so the chart can never be regenerated (D143)", () => {
    const pattern = patternFromPixels(filled(10, 10, [RED])).pattern!;
    expect(pattern.sourceImage).toBeUndefined();
  });

  it("names the chart after the file", () => {
    expect(pixelArtNameFromFileName("mushroom-sprite.png")).toBe("mushroom-sprite");
    expect(pixelArtNameFromFileName("no-extension")).toBe("no-extension");
    expect(pixelArtNameFromFileName(".png")).toBe(DEFAULT_PIXEL_ART_NAME);
    expect(pixelArtNameFromFileName("   ")).toBe(DEFAULT_PIXEL_ART_NAME);
    expect(pixelArtNameFromFileName(`${"x".repeat(200)}.png`)).toHaveLength(100);
  });
});

describe("an image smaller than the minimum is centred in a chart of the minimum", () => {
  it("pads an 8×8 sprite to 10×10, empty all around it", () => {
    const pattern = patternFromPixels(filled(8, 8, [RED])).pattern!;
    expect([pattern.width, pattern.height]).toEqual([MIN_STITCHES, MIN_STITCHES]);
    expect(pattern.palette[0].count).toBe(64);
    const at = (x: number, y: number) => pattern.cellPalette[y * pattern.width + x];
    // One empty ring: the sprite sits at 1..8 on both axes.
    for (let i = 0; i < 10; i++) {
      expect(at(i, 0)).toBe(EMPTY_CELL);
      expect(at(i, 9)).toBe(EMPTY_CELL);
      expect(at(0, i)).toBe(EMPTY_CELL);
      expect(at(9, i)).toBe(EMPTY_CELL);
    }
    expect(at(1, 1)).toBe(0);
    expect(at(8, 8)).toBe(0);
  });

  it("puts the odd stitch right and down, and pads one side only when the other fits", () => {
    const odd = patternFromPixels(filled(7, 7, [RED])).pattern!;
    const at = (p: typeof odd, x: number, y: number) => p.cellPalette[y * p.width + x];
    // 3 spare: one before, two after.
    expect(at(odd, 0, 0)).toBe(EMPTY_CELL);
    expect(at(odd, 1, 1)).toBe(0);
    expect(at(odd, 7, 7)).toBe(0);
    expect(at(odd, 8, 8)).toBe(EMPTY_CELL);

    const wide = patternFromPixels(filled(40, 4, [RED])).pattern!;
    expect([wide.width, wide.height]).toEqual([40, MIN_STITCHES]);
    expect(wide.isLandscape).toBe(true);
    expect(at(wide, 0, 0)).toBe(EMPTY_CELL);
    expect(at(wide, 0, 3)).toBe(0);
  });

  it("keeps a 1×1 image chartable", () => {
    const pattern = patternFromPixels(filled(1, 1, [RED])).pattern!;
    expect([pattern.width, pattern.height]).toEqual([MIN_STITCHES, MIN_STITCHES]);
    expect(pattern.palette[0].count).toBe(1);
    expect(pattern.cellPalette[4 * MIN_STITCHES + 4]).toBe(0);
  });
});

describe("images that cannot be charted are refused, naming the real numbers", () => {
  it("refuses an image wider or taller than the cap", () => {
    const wide = patternFromPixels({ data: new Uint8ClampedArray(0), width: MAX_STITCHES + 1, height: 20 });
    expect(wide.pattern).toBeUndefined();
    expect(wide.error).toBe(`That image is ${MAX_STITCHES + 1} × 20 pixels; the largest chart is ${MAX_STITCHES} stitches a side.`);
    expect(patternFromPixels({ data: new Uint8ClampedArray(0), width: 20, height: 2048 }).error).toContain("20 × 2048 pixels");
  });

  it("accepts the largest chart there is, at the most colours there are", () => {
    const colors: RGB[] = Array.from({ length: MAX_COLORS }, (_, i) => [i, 255 - i, (i * 7) % 256]);
    const result = patternFromPixels(filled(MAX_STITCHES, MAX_STITCHES, colors));
    expect(result.error).toBeNull();
    expect(result.pattern!.palette).toHaveLength(MAX_COLORS);
    expect(result.pattern!.cellPalette).toHaveLength(MAX_STITCHES * MAX_STITCHES);
  });

  it("refuses more colours than a chart holds, counting them all", () => {
    const colors: RGB[] = Array.from({ length: MAX_COLORS + 14 }, (_, i) => [i, 0, 255 - i]);
    const result = patternFromPixels(filled(120, 10, colors));
    expect(result.pattern).toBeUndefined();
    expect(result.error).toBe(`That image has ${MAX_COLORS + 14} colours; a chart holds at most ${MAX_COLORS}.`);
  });

  it("refuses a partly transparent pixel, saying where it is", () => {
    const pixels = filled(10, 10, [RED]);
    pixels.data[(3 * 10 + 2) * 4 + 3] = 128;
    const result = patternFromPixels(pixels);
    expect(result.pattern).toBeUndefined();
    expect(result.error).toBe("That image has partly transparent pixels (the first at 2, 3); a stitch is either there or not.");
  });

  it("refuses an empty image and one whose pixels do not match its size", () => {
    expect(patternFromPixels({ data: new Uint8ClampedArray(0), width: 0, height: 0 }).error).toBe("That image has no pixels to chart.");
    expect(patternFromPixels({ data: new Uint8ClampedArray(16), width: 10, height: 10 }).error).toContain("do not match its size");
  });

  it("refuses before building anything, so a refusal costs nothing", () => {
    const result = patternFromPixels({ data: new Uint8ClampedArray(0), width: 4000, height: 4000 });
    expect(result.pattern).toBeUndefined();
  });
});
