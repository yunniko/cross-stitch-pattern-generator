import { adjustPixelBuffer, isNeutralAdjust, type PhotoAdjust } from "../pipeline/photo-adjust";
import type { PixelBuffer } from "../types";
import type { PhotoMask } from "./photo-mask";

/**
 * The two changes a person makes to the photo itself (G-124): taking pixels out, and applying the four sliders. Each returns
 * a new photo and leaves the one it was given alone, because the old one is a step of the photo's history.
 */

function assertMaskFits(photo: PixelBuffer, mask: PhotoMask): void {
  if (mask.length !== photo.width * photo.height) {
    throw new Error(`A mask of ${mask.length} pixels does not fit a ${photo.width} × ${photo.height} photo.`);
  }
}

/**
 * The selected pixels made absent, with hard edges: each pixel is either taken out whole (alpha 0) or left exactly as it
 * was. Nothing is feathered, so no half-transparent pixel is made (Owner, 2026-10-07: "Delete deletes with hard edges").
 * A taken-out pixel's colour is cleared too, so an absent pixel carries no colour a later step could read (D196).
 */
export function deletePhotoPixels(photo: PixelBuffer, mask: PhotoMask): PixelBuffer {
  assertMaskFits(photo, mask);
  const data = new Uint8ClampedArray(photo.data);
  for (let pixel = 0; pixel < mask.length; pixel++) {
    if (!mask[pixel]) continue;
    const at = pixel * 4;
    data[at] = 0;
    data[at + 1] = 0;
    data[at + 2] = 0;
    data[at + 3] = 0;
  }
  return { data, width: photo.width, height: photo.height };
}

/**
 * The four sliders written into the photo, into the selected pixels only when a mask is given. The arithmetic is the
 * preview's own (`adjustPixelBuffer`), so what is applied is what was shown. Neutral sliders change nothing and return a
 * copy, so an Apply is always a step of its own.
 *
 * Each distinct colour is adjusted once: a photo repeats its colours, and adjusting all 12 million pixels of a large one
 * pixel by pixel took 7 s (D350). The distinct colours are gathered into one strip and adjusted together, so every value is
 * `adjustPixelBuffer`'s own.
 */
export function applyPhotoAdjust(photo: PixelBuffer, adjust: PhotoAdjust, mask: PhotoMask | null): PixelBuffer {
  if (mask) assertMaskFits(photo, mask);
  const data = new Uint8ClampedArray(photo.data);
  if (isNeutralAdjust(adjust)) return { data, width: photo.width, height: photo.height };
  // slot[rgb] is 1 + the colour's place in the strip, 0 for a colour not met yet.
  const slot = new Uint32Array(1 << 24);
  const strip: number[] = [];
  const pixels = data.length / 4;
  for (let pixel = 0; pixel < pixels; pixel++) {
    if (mask && !mask[pixel]) continue;
    const at = pixel * 4;
    const rgb = (data[at] << 16) | (data[at + 1] << 8) | data[at + 2];
    if (slot[rgb] === 0) {
      strip.push(rgb);
      slot[rgb] = strip.length;
    }
  }
  const source = new Uint8ClampedArray(strip.length * 4);
  strip.forEach((rgb, i) => {
    source[i * 4] = rgb >> 16;
    source[i * 4 + 1] = (rgb >> 8) & 255;
    source[i * 4 + 2] = rgb & 255;
    source[i * 4 + 3] = 255;
  });
  const adjusted = adjustPixelBuffer({ data: source, width: strip.length, height: 1 }, adjust).data;
  for (let pixel = 0; pixel < pixels; pixel++) {
    if (mask && !mask[pixel]) continue;
    const at = pixel * 4;
    const from = (slot[(data[at] << 16) | (data[at + 1] << 8) | data[at + 2]] - 1) * 4;
    data[at] = adjusted[from];
    data[at + 1] = adjusted[from + 1];
    data[at + 2] = adjusted[from + 2];
  }
  return { data, width: photo.width, height: photo.height };
}
