import type { DitherMode } from "./dither";

/** What each dither pattern is called where it is offered. The four line screens share a name: they are one choice with a direction. */
export const DITHER_LABELS: Record<DitherMode, string> = {
  off: "Off",
  "bayer-4": "Bayer 4×4",
  "bayer-8": "Bayer 8×8",
  "clustered-8": "Clustered dots",
  "ring-8": "Rings",
  "lines-horizontal": "Lines",
  "lines-vertical": "Lines",
  "lines-diagonal": "Lines",
  "lines-anti-diagonal": "Lines",
  "blue-noise-16": "Blue noise",
  "floyd-steinberg": "Floyd–Steinberg",
  atkinson: "Atkinson",
  "hand-drawn": "Hand-drawn",
};

/** The feature a pattern belongs to: the four line screens are one, and Off is no feature (G-102). */
export function ditherFeature(mode: DitherMode): string | null {
  if (mode === "off") return null;
  return mode.startsWith("lines-") ? "dither.lines" : `dither.${mode}`;
}
