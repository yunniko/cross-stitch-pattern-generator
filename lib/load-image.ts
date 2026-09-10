import type { PixelBuffer } from "./types";

// Every image gets box-downsampled to at most 1000 stitch cells on its
// longer side (see lib/downsample.ts) regardless of source resolution, so
// decoding a high-megapixel phone/camera photo at its full native size
// (unbounded before this) wastes memory for no accuracy benefit -- capping
// the decode itself well above anything downstream ever needs avoids that
// spike (code-review 2026-09-09, finding 4).
const MAX_DECODE_DIMENSION_PX = 4000;

/**
 * Decodes an uploaded file into a `PixelBuffer` via an offscreen canvas.
 * Thin browser-only wrapper — kept out of the pure pipeline modules so those
 * stay unit-testable without a DOM.
 */
export async function loadImageAsPixelBuffer(file: File): Promise<PixelBuffer> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = dataUrl;
  });

  const scale = Math.min(1, MAX_DECODE_DIMENSION_PX / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  ctx.drawImage(image, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}
