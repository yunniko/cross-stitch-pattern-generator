import type { RGB } from "../types";

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

function srgbToLinearFormula(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/**
 * `srgbToLinear` for every 8-bit value, filled from the same formula, so a lookup returns the identical double. The
 * per-call `Math.pow` was about half of all generation time on a 12 MP photo (G-035 M1).
 */
export const SRGB_TO_LINEAR: Float64Array = (() => {
  const table = new Float64Array(256);
  for (let c = 0; c < 256; c++) table[c] = srgbToLinearFormula(c);
  return table;
})();

/** sRGB channel (0-255) to linear light (0-1), for averaging pixels correctly (D7). Integers 1–255 use the table; anything else, including 0 and -0, the formula. */
export function srgbToLinear(c: number): number {
  return c >= 1 && c <= 255 && (c | 0) === c ? SRGB_TO_LINEAR[c] : srgbToLinearFormula(c);
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
 * CIEDE2000 also isn't itself a metric (it violates the triangle
 * inequality), which disqualifies it from the Lloyd's-algorithm centroid
 * update every quantization/optimization pass here depends on (HANDOVER.md
 * D7) — so it was never actually a live option for the pipeline's own
 * clustering regardless of the DMC question. See HANDOVER.md D6.
 *
 * D1 (2026-09-09) also cited "this tool doesn't match to a real DMC/Anchor
 * thread database" as a reason CIEDE2000's extra complexity bought nothing
 * — true when written, no longer true since G-013/D31 (2026-09-10) added
 * `lib/dmc-match.ts`'s DMC snapping. That later addition deliberately
 * reused this same OKLab distance for its nearest-real-thread search too
 * (D31: "the same metric every other color decision in this pipeline
 * uses"), for pipeline consistency — not because OKLab was independently
 * re-evaluated as the right choice for matching against physical DMC
 * floss specifically (where the textile industry's own convention is
 * CIEDE2000 or CMC l:c). Consistency was a reasonable call, but it was
 * inherited rather than re-decided; worth a deliberate look if DMC-match
 * accuracy against real thread ever comes into question.
 */
export function writeOklab(r: number, g: number, b: number, out: Float64Array, offset = 0): void {
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);

  const l = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl;
  const m = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl;
  const s = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  out[offset] = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  out[offset + 1] = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  out[offset + 2] = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
}

const oklabScratch = new Float64Array(3);

/** `rgbToOklab` for separate channel values, without allocating an input tuple; same arithmetic as `writeOklab`. */
export function oklabFromBytes(r: number, g: number, b: number): Oklab {
  writeOklab(r, g, b, oklabScratch);
  return [oklabScratch[0], oklabScratch[1], oklabScratch[2]];
}

/** sRGB to OKLab; see `writeOklab` above for why OKLab. */
export function rgbToOklab([r, g, b]: RGB): Oklab {
  return oklabFromBytes(r, g, b);
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
