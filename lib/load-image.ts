import type { PixelBuffer } from "./types";

// Every image gets box-downsampled to at most 1000 stitch cells on its
// longer side (see lib/downsample.ts) regardless of source resolution, so
// decoding a high-megapixel phone/camera photo at its full native size
// (unbounded before this) wastes memory for no accuracy benefit -- capping
// the decode itself well above anything downstream ever needs avoids that
// spike (code-review 2026-09-09, finding 4).
const MAX_DECODE_DIMENSION_PX = 4000;

/** The original file's own bytes/resolution, kept separately from the (possibly downscaled) decode used for generation -- see `SourceImageRef` in `lib/types.ts` for why. */
export interface DecodedImage {
  pixelBuffer: PixelBuffer;
  originalDataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function decodeImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = dataUrl;
  });
}

/**
 * Decodes a data URL into a generation-ready `PixelBuffer`, capped at
 * `MAX_DECODE_DIMENSION_PX` regardless of the source's own resolution.
 * Shared by both a fresh upload (`loadImageAsPixelBuffer`) and reopening a
 * saved pattern's embedded `sourceImage.dataUrl` (G-012) -- Regenerate needs
 * a `PixelBuffer` either way, whether the photo just came from disk or from
 * a saved file's own embedded copy.
 */
export async function decodeSourceImage(dataUrl: string): Promise<DecodedImage> {
  const image = await decodeImageElement(dataUrl);

  const scale = Math.min(1, MAX_DECODE_DIMENSION_PX / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  ctx.drawImage(image, 0, 0, width, height);
  return {
    pixelBuffer: ctx.getImageData(0, 0, width, height),
    originalDataUrl: dataUrl,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
  };
}

/**
 * Decodes an uploaded file into a `PixelBuffer` via an offscreen canvas,
 * plus the file's own original (uncapped) bytes and resolution for
 * `SourceImageRef`. Thin browser-only wrapper — kept out of the pure
 * pipeline modules so those stay unit-testable without a DOM.
 */
export async function loadImageAsPixelBuffer(file: File): Promise<DecodedImage> {
  const dataUrl = await readFileAsDataUrl(file);
  return decodeSourceImage(dataUrl);
}
