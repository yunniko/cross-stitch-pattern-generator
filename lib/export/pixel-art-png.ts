import { EMPTY_CELL, type PixelBuffer, type StitchPattern } from "../types";

/**
 * Writing a chart back out as pixel art (G-049 M3): one stitch, one pixel, in the stitch's own colour, with an empty
 * stitch left transparent. No grid, no symbols, no margins — the inverse of `pixel-art-import.ts`, so a chart exported
 * and imported again is the same chart.
 *
 * Written in the page rather than on the processor, for the reason the editable save is (D191): it is a pure pass over
 * the cells with no font, canvas trickery or layout involved, and a save that needs no server keeps working when there
 * is none. The canvas here only encodes the PNG.
 */

/** The image of `pattern`: one pixel per stitch, empty stitches transparent. */
export function pixelArtPixels(pattern: StitchPattern): PixelBuffer {
  const { width, height, cellPalette, palette } = pattern;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let cell = 0; cell < cellPalette.length; cell++) {
    const index = cellPalette[cell];
    if (index === EMPTY_CELL) continue;
    const rgb = palette[index]?.rgb;
    if (!rgb) continue;
    const i = cell * 4;
    data[i] = rgb[0];
    data[i + 1] = rgb[1];
    data[i + 2] = rgb[2];
    data[i + 3] = 255;
  }
  return { data, width, height };
}

/** That image as a PNG. The canvas is the encoder only: every pixel is set from the cells, never drawn. */
export async function pixelArtPngBlob(pattern: StitchPattern): Promise<Blob> {
  const { data, width, height } = pixelArtPixels(pattern);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't write the pixel art: no canvas is available.");
  const image = ctx.createImageData(width, height);
  image.data.set(data);
  ctx.putImageData(image, 0, 0);
  return canvas.convertToBlob({ type: "image/png" });
}
