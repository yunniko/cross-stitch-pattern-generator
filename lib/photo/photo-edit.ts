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
 * The photo made smaller, each new pixel the average of the pixels it covers, for an edited photo whose PNG would be larger
 * than a photo may be sent at (D351). Colours are averaged by how present each pixel is, so an absent pixel lends no colour.
 * Presence stays hard: a new pixel is present (alpha 255) when at least half of what it covers is, else absent and colourless,
 * the same line the chart draws (D196), so a Delete's hard edge stays hard at the smaller size.
 */
export function downscalePhoto(photo: PixelBuffer, width: number, height: number): PixelBuffer {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > photo.width || height > photo.height) {
    throw new Error(`A ${photo.width} × ${photo.height} photo cannot be made ${width} × ${height}.`);
  }
  const source = photo.data;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const top = Math.floor((y * photo.height) / height);
    const bottom = Math.max(top + 1, Math.floor(((y + 1) * photo.height) / height));
    for (let x = 0; x < width; x++) {
      const left = Math.floor((x * photo.width) / width);
      const right = Math.max(left + 1, Math.floor(((x + 1) * photo.width) / width));
      let r = 0;
      let g = 0;
      let b = 0;
      let alpha = 0;
      for (let sy = top; sy < bottom; sy++) {
        for (let sx = left; sx < right; sx++) {
          const at = (sy * photo.width + sx) * 4;
          const a = source[at + 3];
          r += source[at] * a;
          g += source[at + 1] * a;
          b += source[at + 2] * a;
          alpha += a;
        }
      }
      const covered = (bottom - top) * (right - left);
      const to = (y * width + x) * 4;
      if (alpha === 0 || alpha / covered < 128) continue;
      data[to] = Math.round(r / alpha);
      data[to + 1] = Math.round(g / alpha);
      data[to + 2] = Math.round(b / alpha);
      data[to + 3] = 255;
    }
  }
  return { data, width, height };
}

/**
 * The size to try next for a photo whose PNG came out `bytes` long against a limit of `limit`: the area cut in proportion,
 * with a margin, since a PNG's size follows its pixel count only roughly.
 */
export function smallerPhotoSize(
  photo: { width: number; height: number },
  bytes: number,
  limit: number
): { width: number; height: number } {
  const scale = Math.min(0.9, Math.sqrt(limit / bytes) * 0.9);
  return { width: Math.max(1, Math.floor(photo.width * scale)), height: Math.max(1, Math.floor(photo.height * scale)) };
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
