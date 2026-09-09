import type { RGB } from "./types";

export type Oklab = readonly [number, number, number];

/** e.g. [255, 0, 128] -> "#ff0080" -- for handing an RGB color to an HTML/react-colorful color input. */
export function rgbToHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** e.g. "#ff0080" -> [255, 0, 128] -- the inverse of `rgbToHex`. */
export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** sRGB channel (0-255) to linear light (0-1). Exported for use anywhere pixel values must be averaged correctly (see HANDOVER.md D7). */
export function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** Linear light (0-1) back to an sRGB channel (0-255, rounded and clamped). */
export function linearToSrgb(v: number): number {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
}

/**
 * OKLab (Björn Ottosson, 2020) instead of CIELAB+CIEDE2000: by construction,
 * plain Euclidean distance in OKLab already approximates perceptual
 * difference well, whereas Euclidean CIELAB distance is known to diverge
 * from perception (CIEDE2000 exists specifically to correct for that gap).
 * Since this tool doesn't match to a real DMC/Anchor thread database — see
 * HANDOVER.md D1's "deliberately not doing" note — there's no industry-
 * convention reason to carry CIEDE2000's complexity. See HANDOVER.md D6.
 */
export function rgbToOklab([r, g, b]: RGB): Oklab {
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);

  const l = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl;
  const m = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl;
  const s = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
}

export function oklabToRgb([L, a, b]: Oklab): RGB {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const rl = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gl = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return [linearToSrgb(rl), linearToSrgb(gl), linearToSrgb(bl)];
}

export function oklabDistanceSquared(a: Oklab, b: Oklab): number {
  const dl = a[0] - b[0];
  const da = a[1] - b[1];
  const db = a[2] - b[2];
  return dl * dl + da * da + db * db;
}

/** Relative luminance (0-255 scale) used for the grayscale export — a display concern, unrelated to the perceptual clustering space above. */
export function luminance([r, g, b]: RGB): number {
  return Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
}
