import { hexToRgb } from "../color/color";
import { canvasTextureById, type ExportCanvas } from "./canvas-texture-catalog";
import { createCanvas, loadExportImage, onExportBackendChange } from "./canvas-backend";

/**
 * The canvas under an exported realistic preview: an opaque `width` × `height` RGBA tile, repeated from the chart's corner,
 * that is the cloth at `cellSize` per cell multiplied with the canvas colour -- what the viewer shows
 * (`lib/editor/canvas-cloth.ts`). No cloth is the plain colour. `rust/cs-export/src/preview.rs` does the same for the
 * production export; the two are alike, not byte-identical (D251).
 */
export interface Ground {
  width: number;
  height: number;
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

/**
 * `pixels` (RGBA, `width` × `height`) with its content moved up and left by `shiftX`/`shiftY` pixels, wrapping: the pixel
 * that was at (shiftX, shiftY) is now at the corner. It is how a tile whose blocks start part-way in (`offsetX`,
 * `offsetY` in the catalog) is made to start on a block edge.
 */
export function rollTile(pixels: Uint8ClampedArray, width: number, height: number, shiftX: number, shiftY: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const from = (((y + shiftY) % height) * width + ((x + shiftX) % width)) * 4;
      out.set(pixels.subarray(from, from + 4), (y * width + x) * 4);
    }
  }
  return out;
}

export async function buildGround(canvas: ExportCanvas, cellSize: number): Promise<Ground> {
  const [r, g, b] = hexToRgb(canvas.color);
  if (canvas.texture === "off") return { width: 1, height: 1, pixels: Uint8ClampedArray.of(r, g, b, 255) };
  const { url, columns, rows, offsetX, offsetY } = canvasTextureById(canvas.texture);
  const width = columns * cellSize;
  const height = rows * cellSize;
  const { ctx } = createCanvas(width, height);
  (ctx as unknown as { imageSmoothingQuality: string }).imageSmoothingQuality = "high";
  ctx.drawImage(await loadCloth(url), 0, 0, width, height);
  const drawn = ctx.getImageData(0, 0, width, height).data;
  const pixels =
    offsetX === 0 && offsetY === 0 ? drawn : rollTile(drawn, width, height, Math.round(offsetX * cellSize), Math.round(offsetY * cellSize));
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = Math.round((r * pixels[i]) / 255);
    pixels[i + 1] = Math.round((g * pixels[i + 1]) / 255);
    pixels[i + 2] = Math.round((b * pixels[i + 2]) / 255);
    pixels[i + 3] = 255;
  }
  return { width, height, pixels };
}
