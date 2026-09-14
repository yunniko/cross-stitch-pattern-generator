import { downsampleToOpaqueRgba, gridDimensionsFor } from "./downsample";
import type { PixelBuffer } from "../types";

/** The Owner's floor for a capped photo: at least this many source pixels per stitch on each side (G-035 M3). */
export const MIN_PIXELS_PER_STITCH = 2;

export type SourceCapResult =
  | { applied: true; buffer: PixelBuffer; pixelsPerStitch: number }
  | { applied: false; buffer: PixelBuffer; reason: "not-larger" | "transparent" };

/** Source pixels per stitch along the photo's tighter axis, for the grid `longerSideStitches` produces. */
export function sourcePixelsPerStitch(width: number, height: number, longerSideStitches: number): number {
  const grid = gridDimensionsFor(width, height, longerSideStitches);
  return Math.min(width / grid.width, height / grid.height);
}

function hasTransparency(source: PixelBuffer): boolean {
  const { data } = source;
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) return true;
  return false;
}

/**
 * Shrinks `source` to exactly (gridWidth × factor) × (gridHeight × factor) pixels with the pipeline's own linear-light
 * box filter, so the stitch grid is unchanged and each stitch later averages whole factor × factor blocks (D127). Only
 * an opaque photo at least that large in both dimensions, and larger in one, is shrunk; anything else comes back
 * untouched with the reason. Transparent photos are left alone because 8-bit alpha rounding in the smaller copy can turn
 * a faint stitch white.
 */
export function capSourceForGrid(source: PixelBuffer, longerSideStitches: number, pixelsPerStitch: number): SourceCapResult {
  if (!Number.isInteger(pixelsPerStitch) || pixelsPerStitch < MIN_PIXELS_PER_STITCH) {
    throw new Error(`pixelsPerStitch must be a whole number of at least ${MIN_PIXELS_PER_STITCH}, got ${pixelsPerStitch}`);
  }
  const grid = gridDimensionsFor(source.width, source.height, longerSideStitches);
  const width = grid.width * pixelsPerStitch;
  const height = grid.height * pixelsPerStitch;
  const shrinks = width <= source.width && height <= source.height && (width < source.width || height < source.height);
  if (!shrinks) return { applied: false, buffer: source, reason: "not-larger" };
  if (hasTransparency(source)) return { applied: false, buffer: source, reason: "transparent" };
  return { applied: true, buffer: downsampleToOpaqueRgba(source, width, height), pixelsPerStitch };
}
