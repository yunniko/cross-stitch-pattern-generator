import { EMPTY_CELL, MAX_STITCHES, MIN_STITCHES, type StitchPattern } from "../types";

/**
 * Charts started from nothing (G-040): every stitch empty, no palette colours and no photo. A chart with no photo can
 * never be generated from one, so Generate stays unavailable for its whole life — the Owner's "no photo, no
 * regeneration". Nothing here is specific to blank charts except the creation: a pattern opened from a file that never
 * had a photo is photo-free in exactly the same way.
 */

export const DEFAULT_BLANK_NAME = "cross-stitch-pattern";

/** The size a chart may be created at, matching the generated charts' own limits. */
export function isValidBlankSize(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_STITCHES && value <= MAX_STITCHES;
}

/** Why a size was refused, for the creation form to show; null when it is fine. */
export function describeBlankSizeProblem(width: number, height: number): string | null {
  for (const [label, value] of [
    ["Width", width],
    ["Height", height],
  ] as const) {
    if (!Number.isFinite(value) || !Number.isInteger(value)) return `${label} must be a whole number of stitches.`;
    if (value < MIN_STITCHES || value > MAX_STITCHES) return `${label} must be between ${MIN_STITCHES} and ${MAX_STITCHES} stitches.`;
  }
  return null;
}

/** A chart of `width` × `height` empty stitches, with no colours and no photo. Throws on a size outside the limits. */
export function createBlankPattern(width: number, height: number, name: string = DEFAULT_BLANK_NAME): StitchPattern {
  const problem = describeBlankSizeProblem(width, height);
  if (problem) throw new Error(problem);
  return {
    width,
    height,
    cellPalette: new Uint8Array(width * height).fill(EMPTY_CELL),
    palette: [],
    isLandscape: width > height,
    name,
  };
}

/** True for a chart that has no photo behind it: Generate, the photo views and the generation settings never apply. */
export function isPhotoFree(pattern: Pick<StitchPattern, "sourceImage"> | null): boolean {
  return pattern !== null && pattern.sourceImage === undefined;
}
