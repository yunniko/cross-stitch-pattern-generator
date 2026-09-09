import type { PixelBuffer, RGB } from "./types";

export interface GridDimensions {
  width: number;
  height: number;
}

/** Grid dimensions for a source image, given the stitch count on its longer side. */
export function gridDimensionsFor(
  sourceWidth: number,
  sourceHeight: number,
  longerSideStitches: number
): GridDimensions {
  if (sourceWidth >= sourceHeight) {
    const width = longerSideStitches;
    const height = Math.max(1, Math.round((longerSideStitches * sourceHeight) / sourceWidth));
    return { width, height };
  }
  const height = longerSideStitches;
  const width = Math.max(1, Math.round((longerSideStitches * sourceWidth) / sourceHeight));
  return { width, height };
}

/**
 * Box-downsamples image pixel data to a `width x height` grid, one averaged
 * RGB color per cell. Averaging (rather than nearest-neighbor sampling)
 * removes most single-pixel outliers before quantization ever sees them —
 * the biggest lever against "confetti" per the research in HANDOVER.md D1.
 */
export function downsampleToGrid(
  imageData: PixelBuffer,
  gridWidth: number,
  gridHeight: number
): RGB[] {
  const { width: srcW, height: srcH, data } = imageData;
  const sums = new Float64Array(gridWidth * gridHeight * 3);
  const counts = new Float64Array(gridWidth * gridHeight);

  for (let y = 0; y < srcH; y++) {
    const cellY = Math.min(gridHeight - 1, Math.floor((y * gridHeight) / srcH));
    for (let x = 0; x < srcW; x++) {
      const cellX = Math.min(gridWidth - 1, Math.floor((x * gridWidth) / srcW));
      const cellIndex = cellY * gridWidth + cellX;
      const pixelIndex = (y * srcW + x) * 4;
      const alpha = data[pixelIndex + 3] / 255;
      // Alpha-weighted so transparent pixels don't drag colors toward black.
      sums[cellIndex * 3] += data[pixelIndex] * alpha;
      sums[cellIndex * 3 + 1] += data[pixelIndex + 1] * alpha;
      sums[cellIndex * 3 + 2] += data[pixelIndex + 2] * alpha;
      counts[cellIndex] += alpha;
    }
  }

  const cells: RGB[] = new Array(gridWidth * gridHeight);
  for (let i = 0; i < cells.length; i++) {
    const count = counts[i] || 1;
    cells[i] = [
      Math.round(sums[i * 3] / count),
      Math.round(sums[i * 3 + 1] / count),
      Math.round(sums[i * 3 + 2] / count),
    ];
  }
  return cells;
}
