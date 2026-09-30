import { canvasTextureById, type CanvasTextureChoice } from "../export/canvas-texture-catalog";

/**
 * The cloth behind the Stitched view, as the CSS of the scrolling well: the tile repeated across all of it, multiplied
 * with the canvas colour, one tile per `columns` × `rows` cells so it zooms with the chart. `originX`/`originY` are where the
 * chart's first cell starts inside the scrolled content, so a tile edge falls on a cell edge; the background is
 * `local`, which scrolls with the content, so scrolling needs no further work.
 *
 * `null` when the texture is off: the well keeps its own dark ground, and only the chart frame is coloured, as before.
 */
export interface ClothStyle {
  backgroundColor: string;
  backgroundImage: string;
  backgroundBlendMode: string;
  backgroundSize: string;
  backgroundPosition: string;
  backgroundAttachment: string;
  backgroundRepeat: string;
}

export function clothStyle(
  texture: CanvasTextureChoice,
  color: string,
  cellSize: number,
  origin: { x: number; y: number }
): ClothStyle | null {
  if (texture === "off") return null;
  const { url, columns, rows, offsetX, offsetY } = canvasTextureById(texture);
  return {
    backgroundColor: color,
    backgroundImage: `url(${url})`,
    backgroundBlendMode: "multiply",
    backgroundSize: `${columns * cellSize}px ${rows * cellSize}px`,
    // Shifted back by the offset, so the cloth's own blocks (not the picture's corner) start at the chart's cells.
    backgroundPosition: `${origin.x - offsetX * cellSize}px ${origin.y - offsetY * cellSize}px`,
    backgroundAttachment: "local",
    backgroundRepeat: "repeat",
  };
}
