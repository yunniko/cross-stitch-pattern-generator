import { createCanvas } from "@/lib/export/canvas-backend";
import type { ChartRegion } from "@/lib/export/render";
import { buildTintedTextureSet } from "@/lib/export/stitch-texture";
import { EMPTY_CELL, type PaletteColor, type StitchPattern } from "@/lib/types";

/**
 * The Image window's Realistic view, drawn per visible region instead of from a whole-chart preview canvas (G-036 M4,
 * D136). The preview drew each stitch as its colour's tinted texture scaled to one cell, on a transparent canvas; here
 * each colour's scaled texture is rasterised once, and a region is assembled from those tiles and drawn in one call.
 * The PNG export keeps `renderStitchPreviewToCanvas`.
 */
export interface StitchTiles {
  palette: readonly PaletteColor[];
  cellSize: number;
  /** RGBA, `cellSize` × `cellSize`, per palette index. */
  pixels: Uint8ClampedArray[];
}

/**
 * The tile size for an on-screen cell size: the preview never drew stitches below 4 px (`effectiveCellSize`) and was
 * stretched down to smaller cells, so tiles stay at 4 px and are drawn scaled below that.
 */
export function tileSizeFor(cellSize: number): number {
  return Math.max(4, cellSize);
}

/** Every palette colour's tinted stitch texture drawn at `cellSize` × `cellSize`, as the preview drew each stitch. */
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

/**
 * Draws `region` of the pattern's realistic view at its chart position: tiles copied into one scratch image, drawn 1:1
 * when the tiles match `cellSize`, or scaled while tiles for a new zoom are still being built. EMPTY stitches stay
 * transparent, so the canvas colour underneath shows through as it did behind the preview.
 */
export function drawRealisticRegion(ctx: CanvasRenderingContext2D, pattern: StitchPattern, tiles: StitchTiles, cellSize: number, region: ChartRegion) {
  const tileSize = tiles.cellSize;
  const columns = region.x1 - region.x0;
  const rows = region.y1 - region.y0;
  if (columns <= 0 || rows <= 0) return;
  const w = columns * tileSize;
  const h = rows * tileSize;
  let scratch: ReturnType<typeof createCanvas>;
  try {
    scratch = createCanvas(w, h);
  } catch {
    return;
  }
  const image = scratch.ctx.createImageData(w, h);
  const out = image.data;
  const rowBytes = tileSize * 4;
  for (let y = region.y0; y < region.y1; y++) {
    for (let x = region.x0; x < region.x1; x++) {
      const paletteIndex = pattern.cellPalette[y * pattern.width + x];
      if (paletteIndex === EMPTY_CELL) continue;
      const tile = tiles.pixels[paletteIndex];
      if (!tile) continue;
      for (let ty = 0; ty < tileSize; ty++) {
        const source = ty * rowBytes;
        out.set(tile.subarray(source, source + rowBytes), (((y - region.y0) * tileSize + ty) * w + (x - region.x0) * tileSize) * 4);
      }
    }
  }
  scratch.ctx.putImageData(image, 0, 0);
  ctx.drawImage(scratch.canvas as CanvasImageSource, region.x0 * cellSize, region.y0 * cellSize, columns * cellSize, rows * cellSize);
}
