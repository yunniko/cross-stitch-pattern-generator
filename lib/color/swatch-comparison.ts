import { rgbToOkhsl } from "./okhsl";
import type { RGB } from "../types";

/**
 * How a candidate swatch compares with the current colour on screen (G-033): Okhsl lightness and saturation
 * differences in whole percentage points, candidate minus current. Okhsl, not HSL: HSL calls pure yellow and pure blue
 * equally light and near-black colours fully saturated. Points, not ratios: a ratio explodes near black. Hue is not
 * compared. These are catalogue sRGB values on screen, not measurements of real floss. See D123.
 */
export interface SwatchDifference {
  /** Positive when the candidate is lighter. */
  lightness: number;
  /** Positive when the candidate is more saturated. */
  saturation: number;
}

/** Rounds half away from zero, so −0.5 points reads as 1% rather than vanishing as −0. */
function roundPoints(fraction: number): number {
  const points = fraction * 100;
  const rounded = Math.round(Math.abs(points));
  return rounded === 0 ? 0 : Math.sign(points) * rounded;
}

export function compareSwatch(current: RGB, candidate: RGB): SwatchDifference {
  const a = rgbToOkhsl(current);
  const b = rgbToOkhsl(candidate);
  return { lightness: roundPoints(b.l - a.l), saturation: roundPoints(b.s - a.s) };
}

/** "12% lighter, 5% less saturated"; empty when both round to zero. */
export function describeDifference(difference: SwatchDifference): string {
  const parts: string[] = [];
  if (difference.lightness !== 0) parts.push(`${Math.abs(difference.lightness)}% ${difference.lightness > 0 ? "lighter" : "darker"}`);
  if (difference.saturation !== 0) parts.push(`${Math.abs(difference.saturation)}% ${difference.saturation > 0 ? "more" : "less"} saturated`);
  return parts.join(", ");
}

/**
 * The readout's parts: the thread's number and name, then each difference on its own -- ["3865 - Winter White",
 * "12% lighter", "5% less saturated"]. No brand prefix and no labels: the Owner asked for the bare facts (G-042).
 */
export function swatchComparisonParts(candidateName: string, current: RGB, candidate: RGB): string[] {
  const difference = compareSwatch(current, candidate);
  const parts = [candidateName];
  if (difference.lightness !== 0) parts.push(`${Math.abs(difference.lightness)}% ${difference.lightness > 0 ? "lighter" : "darker"}`);
  if (difference.saturation !== 0) parts.push(`${Math.abs(difference.saturation)}% ${difference.saturation > 0 ? "more" : "less"} saturated`);
  return parts;
}

/** Exposed for tests: the rounding applied to a lightness or saturation difference given as a 0–1 fraction. */
export const roundDifferencePoints = roundPoints;
