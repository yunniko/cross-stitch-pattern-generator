import { STITCH_BACKSLASH, STITCH_SLASH } from "../editor/stitch-kind";

/**
 * How a half stitch is drawn (G-082): the cell in its colour with two opposite corners cut away, so the canvas or the
 * background shows through. "/" (thread bottom-left to top-right) loses the top-left and bottom-right corners, "\" loses the
 * top-right and bottom-left. Each cut is a right triangle whose legs are `HALF_STITCH_CUT` of the cell's side (Owner,
 * 2026-10-01: 30 %), and the Rust exporter's constant of the same name must agree with this one (D259).
 */
export const HALF_STITCH_CUT = 0.3;

export type Point = readonly [number, number];

/** The six corners of what is left of a `size` × `size` cell, clockwise from the top-left-most one. Empty for a whole stitch. */
export function halfStitchPolygon(kind: number, size: number): Point[] {
  const c = size * HALF_STITCH_CUT;
  const s = size;
  if (kind === STITCH_SLASH)
    return [
      [c, 0],
      [s, 0],
      [s, s - c],
      [s - c, s],
      [0, s],
      [0, c],
    ];
  if (kind === STITCH_BACKSLASH)
    return [
      [0, 0],
      [s - c, 0],
      [s, c],
      [s, s],
      [c, s],
      [0, s - c],
    ];
  return [];
}

/** Whether the point `(x, y)` of a `size` × `size` cell (cell units, y down) is inside what a half stitch leaves. */
function pointInside(kind: number, size: number, x: number, y: number): boolean {
  if (kind !== STITCH_SLASH && kind !== STITCH_BACKSLASH) return true;
  const c = size * HALF_STITCH_CUT;
  // The cut corners: for "/" the top-left (x + y < c) and the bottom-right (x + y > 2s - c); for "\\" the top-right and the bottom-left.
  if (kind === STITCH_SLASH) return x + y >= c && x + y <= 2 * size - c;
  return size - x + y >= c && size - x + y <= 2 * size - c;
}

/** Whether the pixel centre `(px + 0.5, py + 0.5)` of a `size` × `size` cell is inside what a half stitch leaves. */
export function insideHalfStitch(kind: number, size: number, px: number, py: number): boolean {
  return pointInside(kind, size, px + 0.5, py + 0.5);
}

const SAMPLES = 4;
const maskCache = new Map<string, Uint8Array>();

/**
 * How much of each pixel of a `size` × `size` stitch tile a half stitch keeps, 0 to 255, row-major: a 4 × 4 grid of samples per
 * pixel, so the diagonal edge is smooth. The Stitched view and the preview picture multiply a tile's alpha by it (G-082);
 * the Rust exporter computes the same numbers the same way (D259).
 */
export function halfStitchMask(kind: number, size: number): Uint8Array {
  const key = `${kind}:${size}`;
  const cached = maskCache.get(key);
  if (cached) return cached;
  const mask = new Uint8Array(size * size);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let hits = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          if (pointInside(kind, size, px + (sx + 0.5) / SAMPLES, py + (sy + 0.5) / SAMPLES)) hits++;
        }
      }
      mask[py * size + px] = Math.round((hits * 255) / (SAMPLES * SAMPLES));
    }
  }
  maskCache.set(key, mask);
  return mask;
}
