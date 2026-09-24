import { createCanvas } from "@/lib/export/canvas-backend";
import type { ChartRegion } from "@/lib/export/render";
import type { StitchTiles } from "@/lib/export/stitch-texture";
import { EMPTY_CELL, type StitchPattern } from "@/lib/types";

/**
 * The Image window's Realistic view, drawn per visible region instead of from a whole-chart preview canvas (G-036 M4,
 * D136): each colour's scaled texture is rasterised once (`buildStitchTiles`, shared with the preview PNG since
 * G-047 M2), and a region is assembled from those tiles and drawn in one call.
 */

/**
 * The tile size for an on-screen cell size: the preview never drew stitches below 4 px (`effectiveCellSize`) and was
 * stretched down to smaller cells, so tiles stay at 4 px and are drawn scaled below that.
 */
export function tileSizeFor(cellSize: number): number {
  return Math.max(4, cellSize);
}

/**
 * Draws `region` of the pattern's realistic view at its chart position: tiles copied into one scratch image, drawn 1:1
 * when the tiles match `cellSize`, or scaled while tiles for a new zoom are still being built. EMPTY stitches stay
 * transparent, so the canvas colour underneath shows through as it did behind the preview.
 */
export function drawRealisticRegion(
  ctx: CanvasRenderingContext2D,
  pattern: StitchPattern,
  tiles: StitchTiles,
  cellSize: number,
  region: ChartRegion
) {
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
