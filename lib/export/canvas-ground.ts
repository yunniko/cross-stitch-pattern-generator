import { hexToRgb } from "../color/color";
import { canvasTextureById, type ExportCanvas } from "./canvas-texture-catalog";
import { createCanvas, loadExportImage, onExportBackendChange } from "./canvas-backend";

/**
 * The canvas under an exported realistic preview: an opaque `size` × `size` RGBA tile, repeated from the chart's corner,
 * that is the cloth at `cellSize` per cell multiplied with the canvas colour -- what the viewer shows
 * (`lib/editor/canvas-cloth.ts`). No cloth is the plain colour. `rust/cs-export/src/preview.rs` does the same for the
 * production export; the two are alike, not byte-identical (D251).
 */
export interface Ground {
  size: number;
  pixels: Uint8ClampedArray;
}

const images = new Map<string, Promise<CanvasImageSource>>();
// A decoded image belongs to the environment that decoded it (G-034 M4).
onExportBackendChange(() => images.clear());

function loadCloth(url: string): Promise<CanvasImageSource> {
  let image = images.get(url);
  if (!image) {
    image = loadExportImage(url).catch((err: unknown) => {
      images.delete(url);
      throw err;
    });
    images.set(url, image);
  }
  return image;
}

export async function buildGround(canvas: ExportCanvas, cellSize: number): Promise<Ground> {
  const [r, g, b] = hexToRgb(canvas.color);
  if (canvas.texture === "off") return { size: 1, pixels: Uint8ClampedArray.of(r, g, b, 255) };
  const { url, cells } = canvasTextureById(canvas.texture);
  const size = cells * cellSize;
  const { ctx } = createCanvas(size, size);
  (ctx as unknown as { imageSmoothingQuality: string }).imageSmoothingQuality = "high";
  ctx.drawImage(await loadCloth(url), 0, 0, size, size);
  const pixels = ctx.getImageData(0, 0, size, size).data;
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = Math.round((r * pixels[i]) / 255);
    pixels[i + 1] = Math.round((g * pixels[i + 1]) / 255);
    pixels[i + 2] = Math.round((b * pixels[i + 2]) / 255);
    pixels[i + 3] = 255;
  }
  return { size, pixels };
}
