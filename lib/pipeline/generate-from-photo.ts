import type { PixelBuffer, StitchPattern } from "../types";
import { analyzeEnhancement, ENHANCEMENT_PRESETS } from "./enhance";
import { buildPattern, type BuildPatternOptions } from "./pattern";
import { capSourceForGrid } from "./source-cap";

export interface PhotoGenerationOptions extends Omit<BuildPatternOptions, "enhancementParameters" | "sourceDimensions"> {
  /** Shrink the photo to this many source pixels per stitch first (G-035 M3); null or absent reads the full photo. */
  pixelsPerStitch?: number | null;
}

/** What generation actually read. `capped` is false when no cap was requested, or when one couldn't apply (`reason`). */
export interface GenerationSourceInfo {
  width: number;
  height: number;
  requestedPixelsPerStitch: number | null;
  capped: boolean;
  reason?: "not-larger" | "transparent";
}

export interface PhotoGenerationResult {
  pattern: StitchPattern;
  source: GenerationSourceInfo;
}

/**
 * The one entry point generation uses (D127). The full photo goes straight to `buildPattern`, which the golden hashes
 * pin. A requested cap shrinks an opaque photo to an exact multiple of the stitch grid, keeps the original photo's
 * orientation, and applies enhancement analysed on the full photo, as the preview does (D116).
 */
export function generateFromPhoto(photo: PixelBuffer, options: PhotoGenerationOptions): PhotoGenerationResult {
  const { pixelsPerStitch = null, ...buildOptions } = options;
  const fromFullPhoto = (reason?: GenerationSourceInfo["reason"]): PhotoGenerationResult => ({
    pattern: buildPattern(photo, buildOptions),
    source: { width: photo.width, height: photo.height, requestedPixelsPerStitch: pixelsPerStitch, capped: false, reason },
  });
  if (pixelsPerStitch === null) return fromFullPhoto();

  const cap = capSourceForGrid(photo, buildOptions.longerSideStitches, pixelsPerStitch);
  if (!cap.applied) return fromFullPhoto(cap.reason);

  const mode = buildOptions.enhancementMode ?? "off";
  const enhancementParameters = mode === "off" ? undefined : analyzeEnhancement(photo, ENHANCEMENT_PRESETS[mode]);
  const pattern = buildPattern(cap.buffer, { ...buildOptions, enhancementParameters, sourceDimensions: { width: photo.width, height: photo.height } });
  return {
    pattern,
    source: { width: cap.buffer.width, height: cap.buffer.height, requestedPixelsPerStitch: pixelsPerStitch, capped: true },
  };
}
