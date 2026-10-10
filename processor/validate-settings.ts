import { DITHER_MODES } from "@/lib/pipeline/dither";
import { isValidDitherTexture } from "@/lib/pipeline/dither-hand-drawn";
import { generationSettingsRefusal } from "@/lib/pipeline/generation-settings";
import { isValidPhotoAdjust } from "@/lib/pipeline/photo-adjust";
import { requestSystemKeys, threadSystemsRefusal } from "@/lib/thread-systems/thread-system";
import { MAX_COLORS, MAX_STITCHES, MIN_STITCHES } from "@/lib/types";

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
  // The systems first: the palette mode may be any of them (G-132, D400).
  if (b.threadSystems !== undefined) {
    const refusal = threadSystemsRefusal(b.threadSystems);
    if (refusal) return refusal;
  }
  const modes = ["full", ...requestSystemKeys(b)];
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
 * Checking a dither preview request (G-100): a pattern, its own settings, and the size of the chart whose corner is
 * shown. Rust reads it again and refuses anything it does not take; this is the check that answers 400 rather than
 * spawning a process for a malformed body.
 */
export function ditherPreviewError(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return "Expected a JSON object.";
  const b = body as Record<string, unknown>;
  const known = new Set(["ditherMode", "ditherTexture", "chartWidth", "chartHeight"]);
  const unknown = Object.keys(b).find((key) => !known.has(key));
  if (unknown !== undefined) return `${unknown} is not part of a dither preview.`;
  if (typeof b.ditherMode !== "string" || !(DITHER_MODES as readonly string[]).includes(b.ditherMode)) {
    return `ditherMode must be one of: ${DITHER_MODES.join(", ")}.`;
  }
  for (const side of ["chartWidth", "chartHeight"] as const) {
    const value = b[side];
    if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > MAX_STITCHES) {
      return `${side} must be a whole number between 1 and ${MAX_STITCHES}.`;
    }
  }
  if (b.ditherTexture !== undefined && !isValidDitherTexture(b.ditherTexture)) return "ditherTexture is not a valid texture.";
  return null;
}

/**
 * Checking a generation request before any worker is given it (G-034 M2, M3).
 *
 * Kept apart from `server.ts` because that module starts listening and spawns workers when it loads, which a test of
 * this function has no business doing.
 *
 * The settings themselves are not listed here: they are read from the one declaration of them (G-099, D293). The allowed
 * values there are derived from the types themselves, never retyped. They were retyped once, and `PaletteMode`'s
 * unrestricted value "full" was written as "free", so every default generation came back 400 and the editor reported
 * it as a bad photo. A new thread brand would have broken it the same way.
 */
export function settingsError(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return "Expected a JSON object.";
  const b = body as Record<string, unknown>;

  if (typeof b.photoHash !== "string" || !/^[0-9a-f]{64}$/.test(b.photoHash)) return "photoHash must be a SHA-256 hex digest.";

  // Every setting, its range or values and the words of its refusal are declared once (`lib/pipeline/generation-settings.ts`).
  return generationSettingsRefusal(b);
}
