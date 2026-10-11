export interface GridDimensions {
  width: number;
  height: number;
}

/** Grid size for a source image given the longer side's stitch count, rounded so a fractional input can't reach a typed-array allocation (code review 2026-09-09, finding 8). */
export function gridDimensionsFor(sourceWidth: number, sourceHeight: number, longerSideStitches: number): GridDimensions {
  const longerSide = Math.max(1, Math.round(longerSideStitches));
  if (sourceWidth >= sourceHeight) {
    const height = Math.max(1, Math.round((longerSide * sourceHeight) / sourceWidth));
    return { width: longerSide, height };
  }
  const width = Math.max(1, Math.round((longerSide * sourceWidth) / sourceHeight));
  return { width, height: longerSide };
}
