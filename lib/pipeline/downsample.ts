import { linearToSrgb, SRGB_TO_LINEAR } from "../color/color";
import type { CellColorBuffer, PixelBuffer } from "../types";

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
export function downsampleToGrid(imageData: PixelBuffer, gridWidth: number, gridHeight: number): CellColorBuffer {
  return downsampleToGridWithCoverage(imageData, gridWidth, gridHeight).cells;
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
export function downsampleToGridWithCoverage(imageData: PixelBuffer, gridWidth: number, gridHeight: number): DownsampledCells {
  const { width: srcW, height: srcH, data } = imageData;
  const out = new Uint8ClampedArray(gridWidth * gridHeight * 3);
  const coverage = new Float32Array(gridWidth * gridHeight);

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
      if (sumWeight > 0) {
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
