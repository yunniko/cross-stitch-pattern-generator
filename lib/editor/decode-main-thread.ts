import { decodedSize, type DecodedPixels } from "./decode-bitmap";

function decodeImageElement(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = dataUrl;
  });
}

/**
 * The original decode through an `<img>` and a DOM canvas, which blocks the page while the browser decodes and reads
 * back the pixels. Kept only as the fallback when the decode worker is unavailable or fails, and as the parity
 * reference for the worker path (tests/e2e/decode-parity.spec.ts).
 */
export async function decodeDataUrlOnMainThread(dataUrl: string): Promise<DecodedPixels> {
  const image = await decodeImageElement(dataUrl);
  const { width, height } = decodedSize(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  ctx.drawImage(image, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  return { pixelBuffer: { data, width, height }, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight };
}
