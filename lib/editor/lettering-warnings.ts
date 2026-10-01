/**
 * What the Text tab says under its preview about lettering that is likely to read badly (G-081). The thresholds are those of
 * `docs/reviews/2026-10-01-text-legibility.md`: below about 10 stitches an outline font loses its curves and holes, lowercase
 * needs about 12, and with no letter-spacing control letters can touch. They are warnings, not limits: the preview shows the
 * truth, and a small size is allowed down to `MIN_SIZE`.
 */
export const COMFORTABLE_SIZE = 10;
export const LOWERCASE_SIZE = 12;

export function letteringWarnings(text: string, size: number, weight: number): string[] {
  const warnings: string[] = [];
  if (text.trim().length === 0) return warnings;
  if (size < COMFORTABLE_SIZE) {
    warnings.push("Below about 10 stitches an outline font loses its curves and holes. A larger size, or backstitch, reads better.");
  }
  if (size < LOWERCASE_SIZE && /\p{Ll}/u.test(text) && size >= COMFORTABLE_SIZE) {
    warnings.push("Lowercase letters need about 12 stitches or more to keep their holes open.");
  }
  if (size < LOWERCASE_SIZE && text.trim().length > 1) {
    warnings.push("Letters may touch at this size: there is no letter spacing control yet.");
  }
  if (weight <= 25) warnings.push("A light cut can break diagonal strokes.");
  if (weight >= 75) warnings.push("A heavy cut can fill the holes in a, e and o.");
  return warnings;
}
