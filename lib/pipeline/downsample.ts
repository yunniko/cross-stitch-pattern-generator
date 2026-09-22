import { linearToSrgb, oklabToRgbGamutMapped, rgbToOklab, SRGB_TO_LINEAR } from "../color/color";
import type { CellColorBuffer, PixelBuffer, RGB } from "../types";

export interface GridDimensions {
  width: number;
  height: number;
}

/** Grid size for a source image given the longer side's stitch count, rounded so a fractional input can't reach a typed-array allocation (code review 2026-09-09, finding 8). */
export function gridDimensionsFor(
  sourceWidth: number,
  sourceHeight: number,
  longerSideStitches: number
): GridDimensions {
  const longerSide = Math.max(1, Math.round(longerSideStitches));
  if (sourceWidth >= sourceHeight) {
    const height = Math.max(1, Math.round((longerSide * sourceHeight) / sourceWidth));
    return { width: longerSide, height };
  }
  const width = Math.max(1, Math.round((longerSide * sourceWidth) / sourceHeight));
  return { width, height: longerSide };
}

/** A downsample that also reports how much of each cell the photo actually covers (G-050). */
export interface DownsampledCells {
  cells: CellColorBuffer;
  /** Per cell, the alpha-weighted share of its footprint that is opaque: 1 fully covered, 0 fully transparent. */
  coverage: Float32Array;
}

/**
 * A cell covered less than this becomes an empty stitch rather than a colour (Owner, 2026-09-20): an anti-aliased edge
 * resolves the way a stitcher would decide it, and a subject on transparency gets a clean outline instead of a fringe.
 */
export const MIN_CELL_COVERAGE = 0.5;

/** `downsampleToGridWithCoverage`, keeping only the colours — every caller that has no use for coverage. */
export function downsampleToGrid(imageData: PixelBuffer, gridWidth: number, gridHeight: number, vividTopShare = 0): CellColorBuffer {
  return downsampleToGridWithCoverage(imageData, gridWidth, gridHeight, vividTopShare).cells;
}

/**
 * Vivid (G-061): the share of each cell's footprint, by weight, whose chroma the cell keeps. Chosen by measurement
 * over both of the Owner's photos and every fixture (`docs/reviews/2026-09-22-vivid.md`); 0 is off, and the cell is
 * then exactly the area mean it has always been.
 */
export const VIVID_TOP_SHARE = 0.25;

/**
 * Vivid only rescues colour that is *inside* a stitch, so it needs a stitch to hold enough pixels for "its most
 * colourful quarter" to be a real subpopulation rather than a lucky pixel. Below this many source pixels per cell it
 * stands down and the cell is its plain area mean (D211). Measured: on fixtures at about 4 pixels a cell the chroma
 * a cell gains from noise alone reaches 0.127, larger than the 0.03-0.04 that real sub-stitch colour produces on a
 * photo at 144-400 pixels a cell, so no threshold on the gain itself can separate the two.
 */
export const VIVID_MIN_PIXELS_PER_CELL = 24;

/** Whether Vivid can act on this photo at this chart size, which is what a pattern records rather than what was asked (D211). */
export function vividApplies(sourceWidth: number, sourceHeight: number, gridWidth: number, gridHeight: number): boolean {
  return (sourceWidth * sourceHeight) / (gridWidth * gridHeight) >= VIVID_MIN_PIXELS_PER_CELL;
}

/** `max − min` of the sRGB bytes: a whole-number stand-in for chroma, so the pixels a cell keeps are picked by integer comparison in both languages rather than by a float that could round differently. */
function chromaProxy(data: Uint8ClampedArray, pixelIndex: number): number {
  const r = data[pixelIndex];
  const g = data[pixelIndex + 1];
  const b = data[pixelIndex + 2];
  return Math.max(r, g, b) - Math.min(r, g, b);
}

/**
 * Which cells are too transparent to stitch, or null when every cell is covered — the null is what keeps a photo
 * without transparency on exactly the code path it had before (G-050, criterion 3).
 */
export function emptyCellMask(coverage: Float32Array): Uint8Array | null {
  let mask: Uint8Array | null = null;
  for (let i = 0; i < coverage.length; i++) {
    if (coverage[i] >= MIN_CELL_COVERAGE) continue;
    mask ??= new Uint8Array(coverage.length);
    mask[i] = 1;
  }
  return mask;
}

/**
 * Area-weighted box downsample to one averaged RGB per cell: every source pixel contributes by its exact fractional
 * overlap with the cell's rectangle, so non-integral ratios carry no spatial bias and upscaling needs no separate path
 * (code review 2026-09-09, finding 2). Averaging is alpha-weighted, so transparent pixels don't pull colors toward
 * black, and happens in linear light: a 50/50 black/white split averages to sRGB ~188, not ~128 (D7). A cell whose
 * whole footprint is transparent becomes white.
 */
export function downsampleToGridWithCoverage(
  imageData: PixelBuffer,
  gridWidth: number,
  gridHeight: number,
  /**
   * Vivid (G-061): 0 keeps this function exactly as it was. Above 0, the cell keeps its area-mean lightness but takes
   * the chroma of its most colourful `vividTopShare` of weight, so a saturated minority inside one stitch — a red
   * print, a pink petal against cream — is not averaged into a neutral. A cell whose pixels are all equally colourful
   * selects all of them, which makes it its own mean again, so a flat region is untouched either way (D211).
   */
  vividTopShare = 0
): DownsampledCells {
  const { width: srcW, height: srcH, data } = imageData;
  const out = new Uint8ClampedArray(gridWidth * gridHeight * 3);
  const coverage = new Float32Array(gridWidth * gridHeight);
  // A whole-image decision, not a per-cell one: the ratio is the same for every cell up to a pixel, and both
  // languages then take the same branch from the same integers.
  const vivid = vividTopShare > 0 && vividApplies(srcW, srcH, gridWidth, gridHeight);
  // One bucket per value `max − min` can take, reused across cells: the cell's weight by chroma, which turns
  // "the most colourful quarter" into an integer cutoff both languages reach by the same comparisons.
  const chromaWeight = vivid ? new Float64Array(256) : undefined;

  for (let cellY = 0; cellY < gridHeight; cellY++) {
    const ySrcStart = (cellY * srcH) / gridHeight;
    const ySrcEnd = ((cellY + 1) * srcH) / gridHeight;
    const yFirst = Math.max(0, Math.floor(ySrcStart));
    const yLast = Math.min(srcH - 1, Math.ceil(ySrcEnd) - 1);

    for (let cellX = 0; cellX < gridWidth; cellX++) {
      const xSrcStart = (cellX * srcW) / gridWidth;
      const xSrcEnd = ((cellX + 1) * srcW) / gridWidth;
      const xFirst = Math.max(0, Math.floor(xSrcStart));
      const xLast = Math.min(srcW - 1, Math.ceil(xSrcEnd) - 1);

      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumWeight = 0;
      // The footprint's own area, so a cell clipped at the photo's border is judged on the part that exists.
      let sumArea = 0;

      for (let y = yFirst; y <= yLast; y++) {
        const yWeight = Math.min(y + 1, ySrcEnd) - Math.max(y, ySrcStart);
        if (yWeight <= 0) continue;
        for (let x = xFirst; x <= xLast; x++) {
          const xWeight = Math.min(x + 1, xSrcEnd) - Math.max(x, xSrcStart);
          if (xWeight <= 0) continue;
          const pixelIndex = (y * srcW + x) * 4;
          const alpha = data[pixelIndex + 3] / 255;
          const area = xWeight * yWeight;
          const weight = area * alpha;
          sumArea += area;
          sumR += SRGB_TO_LINEAR[data[pixelIndex]] * weight;
          sumG += SRGB_TO_LINEAR[data[pixelIndex + 1]] * weight;
          sumB += SRGB_TO_LINEAR[data[pixelIndex + 2]] * weight;
          sumWeight += weight;
        }
      }

      const i = cellY * gridWidth + cellX;
      coverage[i] = sumArea > 0 ? sumWeight / sumArea : 0;
      if (sumWeight > 0 && chromaWeight) {
        const mean: RGB = [linearToSrgb(sumR / sumWeight), linearToSrgb(sumG / sumWeight), linearToSrgb(sumB / sumWeight)];
        const vividRgb = vividCellColor(data, mean, srcW, xFirst, xLast, yFirst, yLast, xSrcStart, xSrcEnd, ySrcStart, ySrcEnd, sumWeight, vividTopShare, chromaWeight);
        out[i * 3] = vividRgb[0];
        out[i * 3 + 1] = vividRgb[1];
        out[i * 3 + 2] = vividRgb[2];
      } else if (sumWeight > 0) {
        out[i * 3] = linearToSrgb(sumR / sumWeight);
        out[i * 3 + 1] = linearToSrgb(sumG / sumWeight);
        out[i * 3 + 2] = linearToSrgb(sumB / sumWeight);
      } else {
        out[i * 3] = 255;
        out[i * 3 + 1] = 255;
        out[i * 3 + 2] = 255;
      }
    }
  }

  return { cells: { data: out, width: gridWidth, height: gridHeight }, coverage };
}

/**
 * One cell's Vivid colour: the area mean's lightness, with the chroma of the most colourful `topShare` of the cell's
 * weight (G-061, D211). The cutoff is an integer chroma-proxy value, reached by walking the weight histogram down
 * from the most colourful bucket, so both languages select the same pixels; every pixel at or above it is then
 * averaged in linear light with the same alpha-and-area weights the mean used. The recombination is gamut-mapped
 * rather than clipped, because clipping a channel turns an out-of-gamut colour into a different hue (D111).
 */
function vividCellColor(
  data: Uint8ClampedArray,
  mean: RGB,
  srcW: number,
  xFirst: number,
  xLast: number,
  yFirst: number,
  yLast: number,
  xSrcStart: number,
  xSrcEnd: number,
  ySrcStart: number,
  ySrcEnd: number,
  sumWeight: number,
  topShare: number,
  chromaWeight: Float64Array
): RGB {
  chromaWeight.fill(0);
  for (let y = yFirst; y <= yLast; y++) {
    const yWeight = Math.min(y + 1, ySrcEnd) - Math.max(y, ySrcStart);
    if (yWeight <= 0) continue;
    for (let x = xFirst; x <= xLast; x++) {
      const xWeight = Math.min(x + 1, xSrcEnd) - Math.max(x, xSrcStart);
      if (xWeight <= 0) continue;
      const pixelIndex = (y * srcW + x) * 4;
      chromaWeight[chromaProxy(data, pixelIndex)] += xWeight * yWeight * (data[pixelIndex + 3] / 255);
    }
  }

  // The most colourful bucket whose weight, with everything above it, first reaches the share asked for. Ties are
  // kept whole: a cell of one flat colour selects every pixel and is its own mean again.
  const wanted = sumWeight * topShare;
  let kept = 0;
  let cutoff = 0;
  for (let bucket = 255; bucket >= 0; bucket--) {
    kept += chromaWeight[bucket];
    if (kept >= wanted) {
      cutoff = bucket;
      break;
    }
  }

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let weight = 0;
  for (let y = yFirst; y <= yLast; y++) {
    const yWeight = Math.min(y + 1, ySrcEnd) - Math.max(y, ySrcStart);
    if (yWeight <= 0) continue;
    for (let x = xFirst; x <= xLast; x++) {
      const xWeight = Math.min(x + 1, xSrcEnd) - Math.max(x, xSrcStart);
      if (xWeight <= 0) continue;
      const pixelIndex = (y * srcW + x) * 4;
      if (chromaProxy(data, pixelIndex) < cutoff) continue;
      const w = xWeight * yWeight * (data[pixelIndex + 3] / 255);
      sumR += SRGB_TO_LINEAR[data[pixelIndex]] * w;
      sumG += SRGB_TO_LINEAR[data[pixelIndex + 1]] * w;
      sumB += SRGB_TO_LINEAR[data[pixelIndex + 2]] * w;
      weight += w;
    }
  }
  if (weight <= 0) return mean;

  const [, a, b] = rgbToOklab([linearToSrgb(sumR / weight), linearToSrgb(sumG / weight), linearToSrgb(sumB / weight)]);
  const [lightness] = rgbToOklab(mean);
  return oklabToRgbGamutMapped([lightness, a, b]);
}
