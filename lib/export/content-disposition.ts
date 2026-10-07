/**
 * A download's file name in `Content-Disposition`, both ways (G-117). A pattern is named after its photo, so a name may
 * hold any letter ("Kočka"); an HTTP header may not hold one above U+00FF, and Node refuses to send it. The header
 * therefore carries the name twice (RFC 6266): `filename*` in UTF-8, percent-encoded, which browsers read first, and
 * `filename` folded to ASCII for anything that reads only that.
 */

/** "Kočka – ruže.pdf" -> "Kocka _ ruze.pdf": accents dropped, anything else outside printable ASCII made "_". */
function asciiFallback(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "");
}

/** RFC 5987's encoding: percent-encoded UTF-8, with the few characters `encodeURIComponent` leaves that it does not allow. */
function extValue(name: string): string {
  return encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function attachmentDisposition(filename: string): string {
  return `attachment; filename="${asciiFallback(filename)}"; filename*=UTF-8''${extValue(filename)}`;
}

/** The name a disposition gives, preferring the UTF-8 form; null when it names none. */
export function dispositionFilename(disposition: string): string | null {
  const extended = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  if (extended) {
    try {
      return decodeURIComponent(extended.trim());
    } catch {
      // A malformed encoding falls through to the plain name.
    }
  }
  return /filename="([^"]+)"/.exec(disposition)?.[1] ?? null;
}
