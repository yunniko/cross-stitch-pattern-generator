/**
 * A picture's format and size, read from its header before anything decodes it (G-134 M1, D407).
 *
 * The decoder (Skia, through `@napi-rs/canvas`) allocates the whole raster as it decodes, and on a size it cannot allocate
 * it aborts the process rather than throwing: a 100-byte SVG declaring 30000 × 30000 took the processor down. So the
 * pixel cap is checked here, on the header, and only the formats read here reach the decoder at all; anything else
 * (SVG, ICO, TIFF, a file that is not a picture) is refused by name.
 */

export type ImageFormat = "png" | "jpeg" | "gif" | "webp" | "bmp" | "avif";

export interface ImageHeader {
  format: ImageFormat;
  width: number;
  height: number;
}

/** The formats a photo may arrive in, as the refusal names them. */
export const READABLE_FORMATS = "PNG, JPEG, GIF, WebP, BMP or AVIF";

function ascii(bytes: Uint8Array, at: number, text: string): boolean {
  if (at + text.length > bytes.length) return false;
  for (let i = 0; i < text.length; i++) if (bytes[at + i] !== text.charCodeAt(i)) return false;
  return true;
}

/** The header's format and size, or null when it is none of the formats above or too short to say. */
export function readImageHeader(bytes: Uint8Array): ImageHeader | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fits = (end: number) => end <= bytes.length;

  if (ascii(bytes, 0, "\x89PNG\r\n\x1a\n") && ascii(bytes, 12, "IHDR") && fits(24)) {
    return { format: "png", width: view.getUint32(16), height: view.getUint32(20) };
  }
  if ((ascii(bytes, 0, "GIF87a") || ascii(bytes, 0, "GIF89a")) && fits(10)) {
    return { format: "gif", width: view.getUint16(6, true), height: view.getUint16(8, true) };
  }
  if (ascii(bytes, 0, "BM") && fits(26)) {
    // BITMAPCOREHEADER (12 bytes) holds 16-bit sizes; every later header 32-bit ones, the height negative when top-down.
    if (view.getUint32(14, true) === 12) return { format: "bmp", width: view.getUint16(18, true), height: view.getUint16(20, true) };
    return { format: "bmp", width: Math.abs(view.getInt32(18, true)), height: Math.abs(view.getInt32(22, true)) };
  }
  if (ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP")) return webp(bytes, view);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpeg(bytes, view);
  if (ascii(bytes, 4, "ftyp")) return avif(bytes, view);
  return null;
}

function webp(bytes: Uint8Array, view: DataView): ImageHeader | null {
  if (ascii(bytes, 12, "VP8X") && bytes.length >= 30) {
    const u24 = (at: number) => bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
    return { format: "webp", width: u24(24) + 1, height: u24(27) + 1 };
  }
  if (ascii(bytes, 12, "VP8L") && bytes.length >= 25) {
    const bits = view.getUint32(21, true);
    return { format: "webp", width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (ascii(bytes, 12, "VP8 ") && bytes.length >= 30) {
    return { format: "webp", width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
  }
  return null;
}

/** The first start-of-frame marker's size; the markers before it are skipped by their lengths. */
function jpeg(bytes: Uint8Array, view: DataView): ImageHeader | null {
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    if (marker === 0xff) {
      at++; // fill byte
      continue;
    }
    // Markers without a length: TEM and RST0..RST7.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      at += 2;
      continue;
    }
    const length = view.getUint16(at + 2);
    // SOF0..SOF15 carry the frame size; C4 (DHT), C8 (JPG) and CC (DAC) share the range but are not frames.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (at + 9 > bytes.length) return null;
      return { format: "jpeg", width: view.getUint16(at + 7), height: view.getUint16(at + 5) };
    }
    if (length < 2) return null;
    at += 2 + length;
  }
  return null;
}

/**
 * An AVIF's size from its `ispe` properties. A file holds one per image item (the primary, a grid's tiles, an alpha
 * plane, a thumbnail), and the largest is what a decode can allocate, so that is the one counted.
 */
function avif(bytes: Uint8Array, view: DataView): ImageHeader | null {
  const ftypSize = view.getUint32(0);
  if (ftypSize < 12 || ftypSize > bytes.length) return null;
  let isAvif = false;
  for (let at = 8; at + 4 <= ftypSize; at += 4) if (ascii(bytes, at, "avif") || ascii(bytes, at, "avis")) isAvif = true;
  if (!isAvif) return null;
  // Only inside the top-level `meta` box: the compressed pixels elsewhere could hold the four letters by chance.
  let meta: [number, number] | null = null;
  for (let at = 0; at + 8 <= bytes.length;) {
    let size = view.getUint32(at);
    if (size === 1 && at + 16 <= bytes.length) size = Number(view.getBigUint64(at + 8));
    else if (size === 0) size = bytes.length - at;
    if (size < 8) return null;
    if (ascii(bytes, at + 4, "meta")) {
      meta = [at, Math.min(at + size, bytes.length)];
      break;
    }
    at += size;
  }
  if (!meta) return null;
  let best: ImageHeader | null = null;
  for (let at = meta[0]; at + 16 <= meta[1]; at++) {
    if (!ascii(bytes, at, "ispe")) continue;
    const width = view.getUint32(at + 8);
    const height = view.getUint32(at + 12);
    if (!best || width * height > best.width * best.height) best = { format: "avif", width, height };
  }
  return best;
}
