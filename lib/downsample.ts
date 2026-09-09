import { linearToSrgb, srgbToLinear } from "./color";
import type { CellColorBuffer, PixelBuffer } from "./types";

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

/** Nearest-neighbor sample of the source at a cell's center, for cells no source pixel binned into (see downsampleToGrid). */
function sampleNearest(imageData: PixelBuffer, srcX: number, srcY: number): readonly [number, number, number, number] {
  const x = Math.min(imageData.width - 1, Math.max(0, Math.floor(srcX)));
  const y = Math.min(imageData.height - 1, Math.max(0, Math.floor(srcY)));
  const o = (y * imageData.width + x) * 4;
  const { data } = imageData;
  return [data[o], data[o + 1], data[o + 2], data[o + 3]];
}

/**
 * Box-downsamples image pixel data to a `width x height` grid, one averaged
 * RGB color per cell. Averaging (rather than nearest-neighbor sampling)
 * removes most single-pixel outliers before quantization ever sees them —
 * a real lever against "confetti," though not the only one needed (see
 * HANDOVER.md D7 — stitch-level confetti from cells straddling a cluster
 * boundary is handled separately, by the local optimizer in `pattern.ts`).
 *
 * Averaging happens in *linear* light, not gamma-encoded sRGB — averaging
 * encoded values shifts the result away from the true mean radiance (a
 * 50/50 black/white split should average to sRGB ~188, not ~128) and is
 * worst exactly on the fine high-contrast detail a downsample hits
 * constantly (HANDOVER.md D7, citing the standard gamma-correctness rule).
 */
export function downsampleToGrid(imageData: PixelBuffer, gridWidth: number, gridHeight: number): CellColorBuffer {
  const { width: srcW, height: srcH, data } = imageData;
  const cellCount = gridWidth * gridHeight;
  const sums = new Float64Array(cellCount * 3);
  const counts = new Float64Array(cellCount);

  for (let y = 0; y < srcH; y++) {
    const cellY = Math.min(gridHeight - 1, Math.floor((y * gridHeight) / srcH));
    for (let x = 0; x < srcW; x++) {
      const cellX = Math.min(gridWidth - 1, Math.floor((x * gridWidth) / srcW));
      const cellIndex = cellY * gridWidth + cellX;
      const pixelIndex = (y * srcW + x) * 4;
      const alpha = data[pixelIndex + 3] / 255;
      // Alpha-weighted so transparent pixels don't drag colors toward black.
      sums[cellIndex * 3] += srgbToLinear(data[pixelIndex]) * alpha;
      sums[cellIndex * 3 + 1] += srgbToLinear(data[pixelIndex + 1]) * alpha;
      sums[cellIndex * 3 + 2] += srgbToLinear(data[pixelIndex + 2]) * alpha;
      counts[cellIndex] += alpha;
    }
  }

  const out = new Uint8ClampedArray(cellCount * 3);
  for (let cellY = 0; cellY < gridHeight; cellY++) {
    for (let cellX = 0; cellX < gridWidth; cellX++) {
      const i = cellY * gridWidth + cellX;
      const count = counts[i];
      if (count > 0) {
        out[i * 3] = linearToSrgb(sums[i * 3] / count);
        out[i * 3 + 1] = linearToSrgb(sums[i * 3 + 1] / count);
        out[i * 3 + 2] = linearToSrgb(sums[i * 3 + 2] / count);
        continue;
      }
      // No source pixel binned into this cell at all — reachable whenever
      // the requested grid is finer than the source resolution on an axis
      // (nearest-cell binning leaves gaps when upscaling). Falling through
      // to sums/0 would render solid black; sample the source directly at
      // this cell's center instead, and only fall back to white if that
      // exact point is itself fully transparent (HANDOVER.md D7).
      const [r, g, b, a] = sampleNearest(imageData, ((cellX + 0.5) * srcW) / gridWidth, ((cellY + 0.5) * srcH) / gridHeight);
      if (a === 0) {
        out[i * 3] = 255;
        out[i * 3 + 1] = 255;
        out[i * 3 + 2] = 255;
      } else {
        out[i * 3] = r;
        out[i * 3 + 1] = g;
        out[i * 3 + 2] = b;
      }
    }
  }

  return { data: out, width: gridWidth, height: gridHeight };
}
