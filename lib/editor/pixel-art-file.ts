import { MAX_STITCHES, type PixelBuffer } from "../types";
import { patternFromPixels, pixelArtNameFromFileName, type PixelArtImport } from "./pixel-art-import";

/**
 * Reading an image file as pixel art (G-049 M2): the decode the import needs, which is not the photo decode.
 *
 * `decode-bitmap.ts` caps a photo at `MAX_DECODE_DIMENSION_PX` and resamples it, which is right for a photo about to
 * be charted and wrong here — every pixel is a stitch, so nothing may be resampled, converted or premultiplied.
 * `colorSpaceConversion: "none"` and `premultiplyAlpha: "none"` are what keep the bytes the file's own; without them a
 * tagged PNG comes back shifted and a sprite imports in colours the artist never used.
 *
 * The size is checked against the bitmap before any canvas is allocated, so a 6000 px photo is refused for a few
 * hundred bytes rather than 144 MB.
 */

/** Decodes `blob` at its own size, exactly. Throws only if the file is not an image the browser can read. */
export async function decodePixelArtBlob(blob: Blob): Promise<PixelBuffer | { tooLarge: { width: number; height: number } }> {
  const bitmap = await createImageBitmap(blob, { colorSpaceConversion: "none", premultiplyAlpha: "none" });
  try {
    if (bitmap.width > MAX_STITCHES || bitmap.height > MAX_STITCHES) {
      return { tooLarge: { width: bitmap.width, height: bitmap.height } };
    }
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("no 2d context");
    ctx.drawImage(bitmap, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    return { data, width, height };
  } finally {
    bitmap.close();
  }
}

/** The chart this file makes, or why it cannot make one. Every refusal is `patternFromPixels`'s wording (D194). */
export async function openPixelArtFile(file: File): Promise<PixelArtImport> {
  let decoded: Awaited<ReturnType<typeof decodePixelArtBlob>>;
  try {
    decoded = await decodePixelArtBlob(file);
  } catch {
    return { error: "Couldn't read that image. Try a PNG, GIF, WebP or BMP file." };
  }
  if ("tooLarge" in decoded) {
    const { width, height } = decoded.tooLarge;
    // Said here as well as in `patternFromPixels`, because the pixels were never read.
    return { error: `That image is ${width} × ${height} pixels; the largest chart is ${MAX_STITCHES} stitches a side.` };
  }
  return patternFromPixels(decoded, pixelArtNameFromFileName(file.name));
}
