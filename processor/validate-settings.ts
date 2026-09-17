import { ENHANCEMENT_MODE_IDS } from "@/lib/pipeline/enhance";
import { THREAD_BRAND_IDS } from "@/lib/threads/thread-brands";
import { MAX_COLORS, MAX_STITCHES, MIN_COLORS, MIN_STITCHES } from "@/lib/types";

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
    ["enhancementMode", ENHANCEMENT_MODE_IDS],
  ];
  for (const [field, allowed] of enums) {
    const value = b[field];
    if (value !== undefined && (typeof value !== "string" || !allowed.includes(value))) {
      return `${field} must be one of: ${allowed.join(", ")}.`;
    }
  }
  return null;
}
