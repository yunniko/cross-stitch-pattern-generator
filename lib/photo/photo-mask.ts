import { writeOklab } from "../color/color";
import type { SelectionMode } from "../editor/selection-area";
import type { PixelBuffer } from "../types";

/**
 * What is selected on the photo (G-124): a photo-sized mask, 1 for a selected pixel. The photo's counterpart of the chart's
 * `SelectionArea`; it has no lines, so it is a plain mask and the modes are the same three.
 */
export type PhotoMask = Uint8Array;

/** The photo Wand's settings: how far a colour may be from the clicked one, and how the selection spreads. */
export interface PhotoWandRule {
  /** 0 to 100: 0 takes only the clicked colour, 100 a very wide range (`toleranceDistance`). */
  tolerance: number;
  /** Only the pixels joined to the clicked one; off, every matching pixel of the photo. */
  contiguous: boolean;
  /** Pixels meeting only at a corner are joined. */
  diagonal: boolean;
}

export const DEFAULT_PHOTO_WAND: PhotoWandRule = { tolerance: 20, contiguous: true, diagonal: false };

/** A pixel this transparent is absence (D196): it is never selected and a contiguous selection does not cross it. */
export const ABSENT_ALPHA = 128;

/**
 * The OKLab distance a tolerance allows: 0.004 per step, so 100 reaches 0.4, past most of a photo's subject-to-background
 * differences, and 5 is about one just-noticeable difference (0.02, the gamut mapping's, D111). See D349.
 */
export function toleranceDistance(tolerance: number): number {
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 100) {
    throw new Error(`A tolerance runs 0 to 100 (got ${tolerance}).`);
  }
  return tolerance * 0.004;
}

export function emptyPhotoMask(photo: PixelBuffer): PhotoMask {
  return new Uint8Array(photo.width * photo.height);
}

export function isEmptyPhotoMask(mask: PhotoMask): boolean {
  for (let i = 0; i < mask.length; i++) if (mask[i]) return false;
  return true;
}

/** How many pixels a mask selects. */
export function photoMaskCount(mask: PhotoMask): number {
  let count = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) count++;
  return count;
}

/**
 * What a Wand click at pixel (`x`, `y`) selects: the pixels within the tolerance of the clicked colour, joined to it or
 * anywhere in the photo. Each pixel is compared with the clicked colour, never with its neighbour, so a slow gradient does
 * not carry the selection across the whole photo. A click on an absent pixel selects nothing.
 */
export function photoWandMask(photo: PixelBuffer, x: number, y: number, rule: PhotoWandRule): PhotoMask {
  const { width, height, data } = photo;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height) {
    throw new Error(`Pixel (${x}, ${y}) is not on a ${width} × ${height} photo.`);
  }
  if (data.length !== width * height * 4)
    throw new Error(`A ${width} × ${height} photo needs ${width * height * 4} bytes (got ${data.length}).`);
  const mask = new Uint8Array(width * height);
  const seed = y * width + x;
  if (data[seed * 4 + 3] < ABSENT_ALPHA) return mask;

  const limit = toleranceDistance(rule.tolerance) ** 2;
  const lab = new Float64Array(3);
  writeOklab(data[seed * 4], data[seed * 4 + 1], data[seed * 4 + 2], lab);
  const [L0, a0, b0] = lab;
  const matches = (pixel: number): boolean => {
    const at = pixel * 4;
    if (data[at + 3] < ABSENT_ALPHA) return false;
    writeOklab(data[at], data[at + 1], data[at + 2], lab);
    const dL = lab[0] - L0;
    const da = lab[1] - a0;
    const db = lab[2] - b0;
    return dL * dL + da * da + db * db <= limit;
  };

  if (!rule.contiguous) {
    for (let pixel = 0; pixel < mask.length; pixel++) if (matches(pixel)) mask[pixel] = 1;
    return mask;
  }

  // 0 untested, 1 in, 2 tested and out: each pixel is compared once however many neighbours reach it.
  const state = mask;
  const stack = new Int32Array(width * height);
  let top = 0;
  state[seed] = 1;
  stack[top++] = seed;
  while (top > 0) {
    const pixel = stack[--top];
    const px = pixel % width;
    const py = (pixel - px) / width;
    for (let dy = -1; dy <= 1; dy++) {
      const ny = py + dy;
      if (ny < 0 || ny >= height) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const nx = px + dx;
        if ((dx === 0 && dy === 0) || nx < 0 || nx >= width) continue;
        if (!rule.diagonal && dx !== 0 && dy !== 0) continue;
        const next = ny * width + nx;
        if (state[next] !== 0) continue;
        if (matches(next)) {
          state[next] = 1;
          stack[top++] = next;
        } else {
          state[next] = 2;
        }
      }
    }
  }
  for (let i = 0; i < state.length; i++) if (state[i] === 2) state[i] = 0;
  return mask;
}

/** One mask joined with the next by the selection mode, as the chart's selections are (`combineAreas`). */
export function combinePhotoMasks(current: PhotoMask, next: PhotoMask, mode: SelectionMode): PhotoMask {
  if (current.length !== next.length) throw new Error(`Cannot combine masks of ${current.length} and ${next.length} pixels.`);
  if (mode === "replace") return next;
  const out = new Uint8Array(current.length);
  if (mode === "add") for (let i = 0; i < out.length; i++) out[i] = current[i] || next[i] ? 1 : 0;
  else for (let i = 0; i < out.length; i++) out[i] = current[i] && !next[i] ? 1 : 0;
  return out;
}

/** Everything the mask leaves out. */
export function invertPhotoMask(mask: PhotoMask): PhotoMask {
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < out.length; i++) out[i] = mask[i] ? 0 : 1;
  return out;
}
