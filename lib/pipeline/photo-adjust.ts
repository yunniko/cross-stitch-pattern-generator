import { linearToSrgb, writeOklab } from "../color/color";
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
 * The sliders a saved chart or a generated pattern records, or `undefined` when they came to neutral.
 *
 * Absent rather than four zeroes, so a chart made without touching them is the file it would have been
 * before they existed (G-074 criterion 4), and a file from an older build reads the same way.
 */
export function readSavedAdjust(value: unknown): PhotoAdjust | undefined {
  if (value === undefined || value === null) return undefined;
  const adjust = readAdjust(value);
  return isNeutralAdjust(adjust) ? undefined : adjust;
}

/**
 * Whether a request's sliders are ones a slider could have sent: four whole numbers in range, or nothing.
 *
 * Checked before any worker is given the job, as the other settings are. The pipeline clamps as well, but a
 * request that is wrong should be refused where it can still be explained.
 */
export function isValidPhotoAdjust(value: unknown): boolean {
  if (value === undefined) return true;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const keys: Array<keyof PhotoAdjust> = ["brightness", "contrast", "saturation", "temperature"];
  if (Object.keys(v).some((key) => !(keys as string[]).includes(key))) return false;
  return keys.every((key) => {
    const slider = v[key];
    return slider === undefined || (typeof slider === "number" && Number.isInteger(slider) && slider >= -100 && slider <= 100);
  });
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
 * Adjusted OKLab back to an sRGB pixel, written into `out` at `at`.
 *
 * The clamp is the whole of D238: a colour pushed out of sRGB is clipped per channel, not chroma-reduced by
 * `gamutMapOklabToLinear`. The map costs 8x everything else here put together, and it answers "more saturation"
 * by removing saturation -- see `docs/reviews/2026-09-26-photo-adjust-cost.md`.
 */
function writeAdjustedPixel(L: number, a: number, b: number, out: Uint8ClampedArray, at: number): void {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  out[at] = linearToSrgb(clampUnit(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s));
  out[at + 1] = linearToSrgb(clampUnit(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s));
  out[at + 2] = linearToSrgb(clampUnit(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s));
}

function clampUnit(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * A photo's OKLab, one pixel after another, for a preview that will be adjusted many times.
 *
 * The conversion into OKLab does not depend on the sliders, so paying it on every move is waste: it is a fifth
 * of the work, and it is the same answer every time. Only worth keeping for a buffer that is adjusted more than
 * once -- `adjustPixelBuffer` does not use it.
 */
export function oklabCacheFor(source: PixelBuffer): Float64Array {
  const cache = new Float64Array((source.data.length / 4) * 3);
  for (let i = 0, j = 0; i < source.data.length; i += 4, j += 3) {
    writeOklab(source.data[i], source.data[i + 1], source.data[i + 2], cache, j);
  }
  return cache;
}

/**
 * The sliders applied to a cached photo, written into `out`.
 *
 * `alpha` is the source's own bytes, because transparency is absence (D196) and an adjustment changes colour,
 * never what is or is not there. `out` is reused across moves; it is `width * height * 4` bytes.
 */
export function adjustFromCache(cache: Float64Array, alpha: Uint8ClampedArray, adjust: PhotoAdjust, out: Uint8ClampedArray): void {
  const adjusted = new Float64Array(3);
  for (let i = 0, j = 0; i < out.length; i += 4, j += 3) {
    adjustOklab(cache[j], cache[j + 1], cache[j + 2], adjust, adjusted);
    writeAdjustedPixel(adjusted[0], adjusted[1], adjusted[2], out, i);
    out[i + 3] = alpha[i + 3];
  }
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
  for (let i = 0; i < data.length; i += 4) {
    writeOklab(data[i], data[i + 1], data[i + 2], lab);
    adjustOklab(lab[0], lab[1], lab[2], adjust, adjusted);
    writeAdjustedPixel(adjusted[0], adjusted[1], adjusted[2], out, i);
    // Transparency is absence (D196): an adjustment changes colour, never what is or is not there.
    out[i + 3] = data[i + 3];
  }
  return { data: out, width, height };
}
