import { luminance } from "../color/color";
import type { PaletteColor, RGB } from "../types";
import { createCanvas, loadExportImage, onExportBackendChange, type AnyCanvas } from "./canvas-backend";

// Single swappable texture asset -- a photographed/rendered cross-stitch
// with real shading (highlights/shadows) and soft alpha edges. Swap the file
// at this path to change the look; nothing else needs to change.
export const TEXTURE_URL = "/stitch-texture.png";

// The source image can be much higher-res than any cell will ever be drawn
// at (canvas scales it down via drawImage regardless) -- sampling it down to
// a modest fixed size before tinting keeps the per-color tint pass cheap
// without any visible quality loss at on-screen/print cell sizes.
const TEXTURE_SAMPLE_SIZE = 64;

let cachedImage: Promise<CanvasImageSource> | null = null;

// A decoded image belongs to the environment that decoded it, so switching backends must not reuse it (G-034 M4).
onExportBackendChange(() => {
  cachedImage = null;
});

/** The texture as a drawable image; how it is loaded is the backend's business (`canvas-backend.ts`). */
function loadTextureImage(): Promise<CanvasImageSource> {
  if (!cachedImage) {
    cachedImage = loadExportImage(TEXTURE_URL).catch((err: unknown) => {
      // Clear the cache on failure so a later call retries fresh, instead of returning the same rejection until a page
      // reload (code-review 2026-09-09, finding 6).
      cachedImage = null;
      throw err;
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
function tintTexture(image: CanvasImageSource, [r, g, b]: RGB): AnyCanvas {
  const size = TEXTURE_SAMPLE_SIZE;
  const { canvas, ctx } = createCanvas(size, size);

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
  get(paletteIndex: number): AnyCanvas;
}

/** Loads the shared texture (once, cached) and lazily tints it per palette color as requested. */
export async function buildTintedTextureSet(palette: readonly PaletteColor[]): Promise<TintedTextureSet> {
  const image = await loadTextureImage();
  const cache = new Map<number, AnyCanvas>();
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

/** Every palette colour's tinted stitch texture drawn at `cellSize` × `cellSize`, as RGBA pixels (D136). */
export interface StitchTiles {
  palette: readonly PaletteColor[];
  cellSize: number;
  /** RGBA, `cellSize` × `cellSize`, per palette index. */
  pixels: Uint8ClampedArray[];
}

/**
 * Each colour's tinted texture scaled to one stitch, exactly as a stitch is drawn onto a transparent canvas, and read
 * back. The Image window assembles its Realistic view from these (G-036 M4) and the preview PNG streams from them
 * (G-047 M2).
 */
export async function buildStitchTiles(palette: readonly PaletteColor[], cellSize: number): Promise<StitchTiles> {
  const textures = await buildTintedTextureSet(palette);
  const { ctx } = createCanvas(cellSize, cellSize);
  const pixels = palette.map((_, index) => {
    ctx.clearRect(0, 0, cellSize, cellSize);
    ctx.drawImage(textures.get(index) as CanvasImageSource, 0, 0, cellSize, cellSize);
    return ctx.getImageData(0, 0, cellSize, cellSize).data;
  });
  return { palette, cellSize, pixels };
}
