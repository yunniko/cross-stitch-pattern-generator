import { luminance } from "./color";
import type { PaletteColor, RGB } from "./types";

// Single swappable texture asset -- a photographed/rendered cross-stitch
// with real shading (highlights/shadows) and soft alpha edges. Swap the file
// at this path to change the look; nothing else needs to change.
const TEXTURE_URL = "/stitch-texture.png";

// The source image can be much higher-res than any cell will ever be drawn
// at (canvas scales it down via drawImage regardless) -- sampling it down to
// a modest fixed size before tinting keeps the per-color tint pass cheap
// without any visible quality loss at on-screen/print cell sizes.
const TEXTURE_SAMPLE_SIZE = 64;

let cachedImage: Promise<HTMLImageElement> | null = null;

function loadTextureImage(): Promise<HTMLImageElement> {
  if (!cachedImage) {
    cachedImage = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load stitch texture at ${TEXTURE_URL}`));
      img.src = TEXTURE_URL;
    });
  }
  return cachedImage;
}

/**
 * Tints a grayscale-with-alpha texture to a target color while preserving
 * its shading and transparency: each channel is scaled by the source pixel's
 * own luminance (so highlights stay bright, shadows stay dark) and alpha is
 * copied through unchanged.
 */
function tintTexture(image: HTMLImageElement, [r, g, b]: RGB): HTMLCanvasElement {
  const size = TEXTURE_SAMPLE_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  ctx.drawImage(image, 0, 0, size, size);
  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    // Uses the real perceptual-luminance formula rather than assuming the
    // source is exactly R===G===B -- correct either way, and doesn't break
    // if the texture asset is swapped for one that isn't pure grayscale.
    const t = luminance([data[i], data[i + 1], data[i + 2]]) / 255;
    data[i] = r * t;
    data[i + 1] = g * t;
    data[i + 2] = b * t;
    // data[i + 3] (alpha) left untouched -- preserves the texture's own edges/shadow falloff.
  }
  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export interface TintedTextureSet {
  get(paletteIndex: number): HTMLCanvasElement;
}

/** Loads the shared texture (once, cached) and lazily tints it per palette color as requested. */
export async function buildTintedTextureSet(palette: readonly PaletteColor[]): Promise<TintedTextureSet> {
  const image = await loadTextureImage();
  const cache = new Map<number, HTMLCanvasElement>();
  return {
    get(paletteIndex: number) {
      let tinted = cache.get(paletteIndex);
      if (!tinted) {
        tinted = tintTexture(image, palette[paletteIndex].rgb);
        cache.set(paletteIndex, tinted);
      }
      return tinted;
    },
  };
}
