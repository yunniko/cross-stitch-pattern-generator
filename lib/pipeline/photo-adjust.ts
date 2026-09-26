import { gamutMapOklabToLinear, linearToSrgb, writeOklab } from "../color/color";
import type { PixelBuffer } from "../types";

/**
 * The four photo sliders (G-074): what each one does to a pixel.
 *
 * These replace the five enhancement modes, which analysed a photo and decided for the reader. A slider is the
 * reader deciding, so there is no analysis here at all — each value is a fixed transform of every pixel, which
 * is also what makes it cheap enough to run in the browser while a slider moves.
 *
 * The work happens in **OKLab**, the space the rest of this project already clusters and matches threads in:
 * lightness is separate from colour there, so brightness and contrast can move one without dragging the other,
 * and saturation is a plain scale of the two colour axes.
 *
 * **Mirrored in `rust/cs-core/src/photo_adjust.rs`**, because the browser previews in TypeScript and generation
 * applies it in Rust. `scripts/rust-photo-adjust.ts` compares the two through the real binary, so a change to
 * either alone fails rather than quietly making a chart that does not match its preview.
 */

/** Each slider runs -100 to 100, neutral at 0, so the values save and compare exactly. */
export interface PhotoAdjust {
  brightness: number;
  contrast: number;
  saturation: number;
  /** Negative is cooler (bluer), positive warmer (more amber). */
  temperature: number;
}

export const NEUTRAL_ADJUST: PhotoAdjust = { brightness: 0, contrast: 0, saturation: 0, temperature: 0 };

/**
 * OKLab lightness of mid grey (sRGB 128), the pivot contrast turns about.
 *
 * Measured rather than assumed: 0.5 would pivot around a darker grey than the eye calls "middle", pulling a
 * whole photo up as contrast rises. Both languages carry the same literal, which is what keeps them in step.
 */
export const MID_L = 0.5999;

/** How far each slider reaches at its end, chosen so the extremes are strong but not destructive. */
const BRIGHTNESS_REACH = 0.6;
const CONTRAST_REACH = 0.8;
/** In OKLab's b (blue↔yellow) and a (green↔red): warmth is mostly amber, with a little red in it. */
const TEMPERATURE_B = 0.055;
const TEMPERATURE_A = 0.018;

export function isNeutralAdjust(adjust: PhotoAdjust): boolean {
  return adjust.brightness === 0 && adjust.contrast === 0 && adjust.saturation === 0 && adjust.temperature === 0;
}

/** Clamps a slider to its range and drops anything that is not a number, so a bad saved file cannot poison a photo. */
export function clampAdjust(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(-100, Math.min(100, Math.round(value)));
}

/** Reads the four sliders out of unknown data, neutral wherever it does not say otherwise. */
export function readAdjust(value: unknown): PhotoAdjust {
  if (typeof value !== "object" || value === null) return { ...NEUTRAL_ADJUST };
  const v = value as Record<string, unknown>;
  return {
    brightness: clampAdjust(v.brightness),
    contrast: clampAdjust(v.contrast),
    saturation: clampAdjust(v.saturation),
    temperature: clampAdjust(v.temperature),
  };
}

/**
 * One pixel's OKLab, adjusted. Written into `out` so a whole photo needs no allocation per pixel.
 *
 * Brightness keeps both ends where they are — lifting pulls towards white rather than adding a constant, so a
 * bright photo does not lose its highlights to clipping the moment the slider moves.
 */
export function adjustOklab(L: number, a: number, b: number, adjust: PhotoAdjust, out: Float64Array): void {
  const brightness = adjust.brightness / 100;
  const contrast = adjust.contrast / 100;
  const saturation = adjust.saturation / 100;
  const temperature = adjust.temperature / 100;

  let l = brightness >= 0 ? L + brightness * (1 - L) * BRIGHTNESS_REACH : L * (1 + brightness * BRIGHTNESS_REACH);
  l = MID_L + (l - MID_L) * (1 + contrast * CONTRAST_REACH);
  l = Math.max(0, Math.min(1, l));

  const scale = 1 + saturation;
  out[0] = l;
  out[1] = a * scale + temperature * TEMPERATURE_A;
  out[2] = b * scale + temperature * TEMPERATURE_B;
}

/**
 * A photo with the four sliders applied.
 *
 * **Neutral returns the very same buffer**, not a copy of it: an untouched photo has to reach generation as the
 * bytes that were decoded, or a chart made with every slider centred would not be the chart this app made
 * before the sliders existed (G-074 criterion 4). Callers treat the result as read-only either way.
 */
export function adjustPixelBuffer(source: PixelBuffer, adjust: PhotoAdjust): PixelBuffer {
  if (isNeutralAdjust(adjust)) return source;
  const { data, width, height } = source;
  const out = new Uint8ClampedArray(data.length);
  const lab = new Float64Array(3);
  const adjusted = new Float64Array(3);
  const linear = new Float64Array(3);
  for (let i = 0; i < data.length; i += 4) {
    writeOklab(data[i], data[i + 1], data[i + 2], lab);
    adjustOklab(lab[0], lab[1], lab[2], adjust, adjusted);
    gamutMapOklabToLinear(adjusted[0], adjusted[1], adjusted[2], linear);
    out[i] = linearToSrgb(linear[0]);
    out[i + 1] = linearToSrgb(linear[1]);
    out[i + 2] = linearToSrgb(linear[2]);
    // Transparency is absence (D196): an adjustment changes colour, never what is or is not there.
    out[i + 3] = data[i + 3];
  }
  return { data: out, width, height };
}
