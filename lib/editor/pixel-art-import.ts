import { luminance } from "../color/color";
import { nameColors } from "../color/color-names";
import { symbolsFor } from "../color/symbols";
import { EMPTY_CELL, MAX_COLORS, MAX_STITCHES, MIN_STITCHES, type PaletteColor, type PixelBuffer, type RGB, type StitchPattern } from "../types";

/**
 * Opening pixel art as a chart (G-049 M1): one pixel is one stitch, at its own colour, with nothing resampled or
 * re-quantized — the work is already grid-and-palette shaped, so the photo pipeline would only undo it.
 *
 * The chart this builds is structured exactly like a generated one: the same dark-to-light palette order, the same
 * symbol set and the same colour names (`buildPattern` does this too), so the legend, the exports and the editor
 * cannot tell the two apart. What it has no part of is a photo, so Generate stays unavailable for the chart's whole
 * life, the way a blank chart's does (D143).
 *
 * Colours stay custom: no thread brand is guessed here, because snapping a finished sprite to DMC would change its
 * colours and can merge two of them into one (Owner, 2026-09-20). The colour editor snaps them afterwards if wanted.
 *
 * An image smaller than `MIN_STITCHES` a side is centred in a chart of that minimum with empty stitches around it
 * (Owner, 2026-09-20), so an 8×8 sprite opens as a 10×10 chart rather than as a size nothing else in the app has ever
 * been built for. The padding is even, with the odd stitch going right and down.
 *
 * Decoding is the caller's: this takes the pixels so it can be exercised without a browser.
 */

export const DEFAULT_PIXEL_ART_NAME = "pixel-art";

/** A pattern, or why the image cannot be one. Refusals are checked before anything is built. */
export type PixelArtImport = { error: string; pattern?: undefined } | { error: null; pattern: StitchPattern };

/** The chart name for an imported file: its own name without the extension, or the default when there is nothing left. */
export function pixelArtNameFromFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^./\\]+$/, "");
  const trimmed = withoutExtension.trim().slice(0, 100).trim();
  return trimmed === "" ? DEFAULT_PIXEL_ART_NAME : trimmed;
}

/**
 * Every distinct opaque colour in the image, and the first partly transparent pixel if there is one. Membership is a
 * bit per 24-bit colour (2 MB) rather than a `Set` of up to 2.25M numbers, so the true count is always affordable to
 * report — an image that busts the limit still says by how much.
 */
function scanColors(pixels: PixelBuffer): { distinct: number; rgbs: RGB[]; partlyTransparentAt: { x: number; y: number } | null } {
  const seen = new Uint8Array(1 << 21);
  const rgbs: RGB[] = [];
  let distinct = 0;
  for (let i = 0, p = 0; i < pixels.data.length; i += 4, p++) {
    const alpha = pixels.data[i + 3];
    if (alpha === 0) continue;
    if (alpha !== 255) return { distinct, rgbs, partlyTransparentAt: { x: p % pixels.width, y: Math.floor(p / pixels.width) } };
    const key = (pixels.data[i] << 16) | (pixels.data[i + 1] << 8) | pixels.data[i + 2];
    const bit = 1 << (key & 7);
    const byte = key >> 3;
    if (seen[byte] & bit) continue;
    seen[byte] |= bit;
    distinct++;
    // Past the limit the import is refused anyway; only the count still matters.
    if (distinct <= MAX_COLORS) rgbs.push([pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]]);
  }
  return { distinct, rgbs, partlyTransparentAt: null };
}

/** The chart this image makes, or the reason it cannot make one. `name` is the chart's name, usually from the file. */
export function patternFromPixels(pixels: PixelBuffer, name: string = DEFAULT_PIXEL_ART_NAME): PixelArtImport {
  const { width, height } = pixels;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    return { error: "That image has no pixels to chart." };
  }
  if (width > MAX_STITCHES || height > MAX_STITCHES) {
    return { error: `That image is ${width} × ${height} pixels; the largest chart is ${MAX_STITCHES} stitches a side.` };
  }
  if (pixels.data.length !== width * height * 4) {
    return { error: "That image could not be read: its pixels do not match its size." };
  }

  const { distinct, rgbs, partlyTransparentAt } = scanColors(pixels);
  if (partlyTransparentAt) {
    const { x, y } = partlyTransparentAt;
    return { error: `That image has partly transparent pixels (the first at ${x}, ${y}); a stitch is either there or not.` };
  }
  if (distinct > MAX_COLORS) {
    return { error: `That image has ${distinct} colours; a chart holds at most ${MAX_COLORS}.` };
  }

  // Dark to light, as `buildPattern` orders a palette, then symbols and names in that order.
  const order = rgbs.map((rgb, index) => ({ rgb, index, luminance: luminance(rgb) })).sort((a, b) => a.luminance - b.luminance);
  const symbols = symbolsFor(order.length);
  const names = nameColors(order.map((entry) => entry.rgb));
  const indexByColor = new Map<number, number>();
  order.forEach((entry, newIndex) => indexByColor.set((entry.rgb[0] << 16) | (entry.rgb[1] << 8) | entry.rgb[2], newIndex));

  // Too small a side is padded out to the minimum with empty stitches, the image centred in what it makes.
  const chartWidth = Math.max(width, MIN_STITCHES);
  const chartHeight = Math.max(height, MIN_STITCHES);
  const offsetX = Math.floor((chartWidth - width) / 2);
  const offsetY = Math.floor((chartHeight - height) / 2);

  const cellPalette = new Uint8Array(chartWidth * chartHeight).fill(EMPTY_CELL);
  const counts = new Array(order.length).fill(0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (pixels.data[i + 3] === 0) continue;
      const index = indexByColor.get((pixels.data[i] << 16) | (pixels.data[i + 1] << 8) | pixels.data[i + 2]) ?? 0;
      cellPalette[(y + offsetY) * chartWidth + x + offsetX] = index;
      counts[index]++;
    }
  }

  const palette: PaletteColor[] = order.map((entry, index) => ({ index, rgb: entry.rgb, symbol: symbols[index], name: names[index], count: counts[index] }));
  return { error: null, pattern: { width: chartWidth, height: chartHeight, cellPalette, palette, isLandscape: chartWidth > chartHeight, name } };
}
