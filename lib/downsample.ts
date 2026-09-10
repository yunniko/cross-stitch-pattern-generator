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

/**
 * Box-downsamples image pixel data to a `width x height` grid, one averaged
 * RGB color per cell, using true area-weighted averaging: each destination
 * cell's exact source-space rectangle is computed, and every source pixel it
 * overlaps contributes proportionally to its fractional area overlap (the
 * standard box-filter resampling algorithm), not just whichever single cell
 * its center happens to fall in.
 *
 * The earlier version assigned each *source* pixel wholly to one destination
 * cell via `floor(x * gridWidth / srcWidth)` -- correct only at integral
 * scale ratios. At any other ratio it introduced real spatial bias: a
 * symmetric 3-pixel black/white/black stripe downsampled to 2 cells came out
 * gray-188 then black-0, when the true area-weighted average is gray-156 in
 * both cells (verified by hand and by `tests/unit/downsample.spec.ts`).
 * Averaging still happens in *linear* light, not gamma-encoded sRGB —
 * averaging encoded values shifts the result away from the true mean
 * radiance (a 50/50 black/white split should average to sRGB ~188, not
 * ~128) and is worst exactly on the fine high-contrast detail a downsample
 * hits constantly (HANDOVER.md D7, citing the standard gamma-correctness
 * rule); this alone removes most single-pixel outliers before quantization
 * ever sees them -- a real lever against "confetti," though not the only one
 * needed (stitch-level confetti from cells straddling a cluster boundary is
 * handled separately, by the local optimizer in `pattern.ts`).
 *
 * This same rectangle-overlap approach handles upscaling too (a destination
 * cell smaller than one source pixel, when the source photo is smaller than
 * the requested stitch count) with no separate code path: every cell's
 * rectangle always overlaps at least one real source pixel for opaque
 * content, so the earlier nearest-neighbor gap-filling fallback (needed
 * only because center-point binning could skip cells entirely on upscale)
 * is no longer reachable and has been removed. A destination cell only
 * falls back to white when its *entire* overlapped source region is fully
 * transparent -- a direct, more correct generalization of the old single-
 * point transparency check (code-review 2026-09-09, finding 2).
 */
export function downsampleToGrid(imageData: PixelBuffer, gridWidth: number, gridHeight: number): CellColorBuffer {
  const { width: srcW, height: srcH, data } = imageData;
  const out = new Uint8ClampedArray(gridWidth * gridHeight * 3);

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

      for (let y = yFirst; y <= yLast; y++) {
        const yWeight = Math.min(y + 1, ySrcEnd) - Math.max(y, ySrcStart);
        if (yWeight <= 0) continue;
        for (let x = xFirst; x <= xLast; x++) {
          const xWeight = Math.min(x + 1, xSrcEnd) - Math.max(x, xSrcStart);
          if (xWeight <= 0) continue;
          const pixelIndex = (y * srcW + x) * 4;
          const alpha = data[pixelIndex + 3] / 255;
          // Alpha-weighted so transparent pixels don't drag colors toward black.
          const weight = xWeight * yWeight * alpha;
          sumR += srgbToLinear(data[pixelIndex]) * weight;
          sumG += srgbToLinear(data[pixelIndex + 1]) * weight;
          sumB += srgbToLinear(data[pixelIndex + 2]) * weight;
          sumWeight += weight;
        }
      }

      const i = cellY * gridWidth + cellX;
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

  return { data: out, width: gridWidth, height: gridHeight };
}
