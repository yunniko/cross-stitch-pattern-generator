// Shared by the live size readout and the exported chart header, so the two estimates can't drift apart.

// The standard, widely available Aida counts across independent guides (retrieved 2026-09-09). Specialty "over 2"
// evenweave is excluded: it isn't a plain stitches-per-inch fabric in this model.
export const STANDARD_AIDA_COUNTS = [11, 14, 16, 18] as const;
export type AidaCount = (typeof STANDARD_AIDA_COUNTS)[number];
export const DEFAULT_AIDA_COUNT: AidaCount = 14;

export type SizeUnit = "in" | "cm";
// Owner decision (2026-09-10, G-015): cm is the default unit -- most of
// this app's audience (and its .cz deployment domain) uses metric.
export const DEFAULT_SIZE_UNIT: SizeUnit = "cm";
const CM_PER_INCH = 2.54;

export function stitchesToInches(stitches: number, aidaCount: number): number {
  return stitches / aidaCount;
}

export function stitchesToCm(stitches: number, aidaCount: number): number {
  return stitchesToInches(stitches, aidaCount) * CM_PER_INCH;
}

function stitchesToUnit(stitches: number, aidaCount: number, unit: SizeUnit): number {
  return unit === "in" ? stitchesToInches(stitches, aidaCount) : stitchesToCm(stitches, aidaCount);
}

/** e.g. "3.6 in" or "9.1 cm" for a single dimension, in whichever unit is selected. */
export function formatFinishedDimension(stitches: number, aidaCount: number, unit: SizeUnit): string {
  return `${stitchesToUnit(stitches, aidaCount, unit).toFixed(1)} ${unit}`;
}

/** e.g. "3.6 × 2.2 in" for a width/height pair, in whichever unit is selected. */
export function formatFinishedSize(widthStitches: number, heightStitches: number, aidaCount: number, unit: SizeUnit): string {
  const w = stitchesToUnit(widthStitches, aidaCount, unit).toFixed(1);
  const h = stitchesToUnit(heightStitches, aidaCount, unit).toFixed(1);
  return `${w} × ${h} ${unit}`;
}
