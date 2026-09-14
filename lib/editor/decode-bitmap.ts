import type { PixelBuffer } from "../types";

// Generation box-downsamples to at most 1000 stitches on the longer side, so decoding a camera photo beyond this size
// wastes memory for no accuracy benefit (code review 2026-09-09, finding 4).
export const MAX_DECODE_DIMENSION_PX = 4000;

/** A decoded photo: the generation buffer (capped at `MAX_DECODE_DIMENSION_PX`) plus the file's own oriented size. */
export interface DecodedPixels {
  pixelBuffer: PixelBuffer;
  naturalWidth: number;
  naturalHeight: number;
}

/** The decode size for a photo of the given oriented size. Shared by both decode paths so they can't drift. */
export function decodedSize(naturalWidth: number, naturalHeight: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_DECODE_DIMENSION_PX / Math.max(naturalWidth, naturalHeight));
  return { width: Math.max(1, Math.round(naturalWidth * scale)), height: Math.max(1, Math.round(naturalHeight * scale)) };
}

/**
 * Decodes an image file with `createImageBitmap` and `OffscreenCanvas`, which both exist inside a worker, so the decode
 * and the pixel read-back never block the page (G-035 M3). EXIF orientation is applied, as an `<img>` does; the
 * browser's colour management and resampling are the same as the main-thread path (tests/e2e/decode-parity.spec.ts).
 */
export async function decodeBlobOffscreen(blob: Blob): Promise<DecodedPixels> {
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
  try {
    const { width, height } = decodedSize(bitmap.width, bitmap.height);
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    ctx.drawImage(bitmap, 0, 0, width, height);
    const image = ctx.getImageData(0, 0, width, height);
    return { pixelBuffer: { data: image.data, width, height }, naturalWidth: bitmap.width, naturalHeight: bitmap.height };
  } finally {
    bitmap.close();
  }
}
