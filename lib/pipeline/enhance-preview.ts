import { downsampleToGrid, gridDimensionsFor } from "./downsample";
import { applyEnhancement, type EnhancementParameters } from "./enhance";
import type { PixelBuffer } from "../types";

/** Longest side of the photo preview shown before Generate (G-032 M3). */
export const ENHANCEMENT_PREVIEW_MAX_SIDE = 1200;

/**
 * Area-weighted, linear-light downscale (the pipeline's own `downsampleToGrid`) to at most `maxSide` on the longer side.
 * A source already that small is returned as-is. The copy is opaque: the preview only shows colour.
 */
export function downscaleForPreview(source: PixelBuffer, maxSide: number): PixelBuffer {
  if (Math.max(source.width, source.height) <= maxSide) return source;
  const { width, height } = gridDimensionsFor(source.width, source.height, maxSide);
  const cells = downsampleToGrid(source, width, height);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = cells.data[i * 3];
    data[i * 4 + 1] = cells.data[i * 3 + 1];
    data[i * 4 + 2] = cells.data[i * 3 + 2];
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

/**
 * The preview: parameters analysed on the FULL source, applied to its downscaled copy, so the preview uses the same
 * white balance, tone curve and CLAHE tiles as generation. Enhancement doesn't commute with downscaling, so this is an
 * approximation of downscaling the full enhanced photo, with its error bounded in tests (Codex round 2, D116).
 */
export function buildEnhancedPreview(
  source: PixelBuffer,
  params: EnhancementParameters,
  maxSide = ENHANCEMENT_PREVIEW_MAX_SIDE
): PixelBuffer {
  return applyEnhancement(downscaleForPreview(source, maxSide), params);
}
