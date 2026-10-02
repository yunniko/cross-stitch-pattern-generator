import { DITHER_MODES, isDithered, type DitherMode } from "@/lib/pipeline/dither";
import { isValidDitherTexture } from "@/lib/pipeline/dither-hand-drawn";
import { isValidPhotoAdjust } from "@/lib/pipeline/photo-adjust";
import { THREAD_BRAND_IDS } from "@/lib/threads/thread-brands";
import { MAX_COLORS, MAX_STITCHES, MIN_COLORS, MIN_STITCHES } from "@/lib/types";

/**
 * Checking a prediction request (G-087): a photo, a size, the palette mode, the photo sliders, and optionally the colours of a set.
 */
export function predictionError(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return "Expected a JSON object.";
  const b = body as Record<string, unknown>;
  if (typeof b.photoHash !== "string" || !/^[0-9a-f]{64}$/.test(b.photoHash)) return "photoHash must be a SHA-256 hex digest.";
  const stitches = b.longerSideStitches;
  if (!Number.isInteger(stitches) || (stitches as number) < MIN_STITCHES || (stitches as number) > MAX_STITCHES) {
    return `longerSideStitches must be a whole number between ${MIN_STITCHES} and ${MAX_STITCHES}.`;
  }
  const modes = ["full", ...THREAD_BRAND_IDS];
  if (b.paletteMode !== undefined && (typeof b.paletteMode !== "string" || !modes.includes(b.paletteMode))) {
    return `paletteMode must be one of: ${modes.join(", ")}.`;
  }
  if (!isValidPhotoAdjust(b.photoAdjust)) {
    return "photoAdjust must be an object whose brightness, contrast, saturation and temperature are whole numbers between -100 and 100.";
  }
  if (b.paletteSet !== undefined) {
    const set = b.paletteSet;
    const ok =
      Array.isArray(set) &&
      set.length >= 1 &&
      set.length <= MAX_COLORS &&
      set.every((c) => Array.isArray(c) && c.length === 3 && c.every((v) => Number.isInteger(v) && v >= 0 && v <= 255));
    if (!ok) return `paletteSet must be between 1 and ${MAX_COLORS} colours of [red, green, blue] whole numbers from 0 to 255.`;
  }
  return null;
}

/**
 * Checking a generation request before any worker is given it (G-034 M2, M3).
 *
 * Kept apart from `server.ts` because that module starts listening and spawns workers when it loads, which a test of
 * this function has no business doing.
 *
 * The allowed values are derived from the types themselves, never retyped. They were retyped once, and `PaletteMode`'s
 * unrestricted value "full" was written as "free", so every default generation came back 400 and the editor reported
 * it as a bad photo. A new thread brand would have broken it the same way.
 */
export function settingsError(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return "Expected a JSON object.";
  const b = body as Record<string, unknown>;

  if (typeof b.photoHash !== "string" || !/^[0-9a-f]{64}$/.test(b.photoHash)) return "photoHash must be a SHA-256 hex digest.";

  const stitches = b.longerSideStitches;
  if (!Number.isInteger(stitches) || (stitches as number) < MIN_STITCHES || (stitches as number) > MAX_STITCHES) {
    return `longerSideStitches must be a whole number between ${MIN_STITCHES} and ${MAX_STITCHES}.`;
  }

  const colors = b.colorCount;
  if (!Number.isInteger(colors) || (colors as number) < MIN_COLORS || (colors as number) > MAX_COLORS) {
    return `colorCount must be a whole number between ${MIN_COLORS} and ${MAX_COLORS}.`;
  }

  const enums: Array<[string, readonly string[]]> = [
    ["generationMode", ["original", "latest"]],
    ["paletteMode", ["full", ...THREAD_BRAND_IDS]],
    ["edgeMode", ["standard", "crisp", "crisp-plus"]],
    ["ditherMode", DITHER_MODES],
  ];
  for (const [field, allowed] of enums) {
    const value = b[field];
    if (value !== undefined && (typeof value !== "string" || !allowed.includes(value))) {
      return `${field} must be one of: ${allowed.join(", ")}.`;
    }
  }
  // Refused here rather than inside a worker: `buildPattern` throws on the combination (D199), and a 500 would tell
  // the reader their photo was at fault.
  if (isDithered(b.ditherMode as DitherMode | undefined) && b.edgeMode !== undefined && b.edgeMode !== "standard") {
    return "ditherMode cannot be combined with a Crisp edgeMode: Crisp preserves hard boundaries, which dithering deliberately blends.";
  }
  // A plain flag, checked so a stray string cannot reach the pipeline as a truthy value (G-061).
  if (b.vivid !== undefined && typeof b.vivid !== "boolean") {
    return "vivid must be true or false.";
  }
  // The line tracing (G-084): a flag, and a sensitivity between 0 and 1.
  if (b.backstitchLines !== undefined && typeof b.backstitchLines !== "boolean") {
    return "backstitchLines must be true or false.";
  }
  if (b.backstitchPhotos !== undefined && typeof b.backstitchPhotos !== "boolean") {
    return "backstitchPhotos must be true or false.";
  }
  // A set of colours to make the chart from (G-087): its mode, and a code each in a brand or an RGB each otherwise.
  if (b.paletteSet !== undefined) {
    const set = b.paletteSet;
    const modes = ["full", ...THREAD_BRAND_IDS];
    if (typeof set !== "object" || set === null) return "paletteSet must be an object.";
    const s = set as Record<string, unknown>;
    if (typeof s.mode !== "string" || !modes.includes(s.mode)) return `paletteSet.mode must be one of: ${modes.join(", ")}.`;
    if (b.paletteMode !== undefined && b.paletteMode !== s.mode) return "paletteSet.mode must be the paletteMode.";
    const colors = s.colors;
    if (!Array.isArray(colors) || colors.length < 1 || colors.length > MAX_COLORS) {
      return `paletteSet.colors must hold between 1 and ${MAX_COLORS} colours.`;
    }
    const valid = colors.every((c) => {
      if (typeof c !== "object" || c === null) return false;
      const e = c as Record<string, unknown>;
      if (s.mode === "full")
        return Array.isArray(e.rgb) && e.rgb.length === 3 && e.rgb.every((v) => Number.isInteger(v) && v >= 0 && v <= 255);
      return typeof e.code === "string" && e.code.length >= 1 && e.code.length <= 16;
    });
    if (!valid)
      return "paletteSet.colors must each be a thread code in a brand or an RGB of whole numbers from 0 to 255 in the full colour mode.";
  }
  // The texture strokes (G-085): a flag, and a density between 0 and 1.
  if (b.textureStrokes !== undefined && typeof b.textureStrokes !== "boolean") {
    return "textureStrokes must be true or false.";
  }
  if (b.textureDensity !== undefined && (typeof b.textureDensity !== "number" || !(b.textureDensity >= 0 && b.textureDensity <= 1))) {
    return "textureDensity must be a number between 0 and 1.";
  }
  if (
    b.backstitchSensitivity !== undefined &&
    (typeof b.backstitchSensitivity !== "number" || !(b.backstitchSensitivity >= 0 && b.backstitchSensitivity <= 1))
  ) {
    return "backstitchSensitivity must be a number between 0 and 1.";
  }
  // Whole numbers in range, or nothing: a slider cannot produce anything else, and the pipeline should not
  // be asked to make sense of one that did (G-074).
  if (!isValidPhotoAdjust(b.photoAdjust)) {
    return "photoAdjust must be an object whose brightness, contrast, saturation and temperature are whole numbers between -100 and 100.";
  }
  // Ranges, not a type union: a texture is numbers, and the union trick the other fields use cannot check a number.
  if (b.ditherTexture !== undefined && !isValidDitherTexture(b.ditherTexture)) {
    return "ditherTexture must be an object whose values are all inside their ranges.";
  }
  return null;
}
