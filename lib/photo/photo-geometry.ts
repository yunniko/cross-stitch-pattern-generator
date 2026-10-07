/**
 * Where the pointer is on the photo (G-124): the photo is drawn scaled into a box on screen, and a press is turned into the
 * pixel under it. Pure, so the stage that draws the photo and the tests agree on one rule.
 */
export interface ScreenBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The photo pixel under a point given in the same coordinates as `box` (client pixels), or null off the photo. The box is
 * where the whole photo is drawn, so each axis scales on its own; a point on the right or bottom edge belongs to the last
 * pixel.
 */
export function photoPixelAt(
  point: { x: number; y: number },
  box: ScreenBox,
  photo: { width: number; height: number }
): { x: number; y: number } | null {
  if (box.width <= 0 || box.height <= 0) return null;
  const u = (point.x - box.left) / box.width;
  const v = (point.y - box.top) / box.height;
  if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) return null;
  return { x: Math.min(photo.width - 1, Math.floor(u * photo.width)), y: Math.min(photo.height - 1, Math.floor(v * photo.height)) };
}
