import type { PhotoMask } from "./photo-mask";

/**
 * The selection's outline on the photo (G-124), at the size the photo is drawn rather than its own: a 12-megapixel mask
 * is far finer than the screen, and walking its boundary as paths would take seconds. The mask is sampled at the drawn size
 * (nearest pixel), and a drawn pixel is on the outline when it is selected and a neighbour above, below, left or right of it
 * is not, or it lies on the photo's edge.
 */
export function photoOutline(
  mask: PhotoMask,
  photo: { width: number; height: number },
  drawn: { width: number; height: number }
): Uint8Array {
  if (mask.length !== photo.width * photo.height) {
    throw new Error(`A mask of ${mask.length} pixels does not fit a ${photo.width} × ${photo.height} photo.`);
  }
  const { width, height } = drawn;
  const sampled = new Uint8Array(width * height);
  const columns = new Int32Array(width);
  for (let x = 0; x < width; x++) columns[x] = Math.min(photo.width - 1, Math.floor(((x + 0.5) * photo.width) / width));
  for (let y = 0; y < height; y++) {
    const row = Math.min(photo.height - 1, Math.floor(((y + 0.5) * photo.height) / height)) * photo.width;
    for (let x = 0; x < width; x++) sampled[y * width + x] = mask[row + columns[x]] ? 1 : 0;
  }
  const outline = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = y * width + x;
      if (!sampled[at]) continue;
      const edge =
        x === 0 ||
        y === 0 ||
        x === width - 1 ||
        y === height - 1 ||
        !sampled[at - 1] ||
        !sampled[at + 1] ||
        !sampled[at - width] ||
        !sampled[at + width];
      if (edge) outline[at] = 1;
    }
  }
  return outline;
}
