import type { Canvas2D } from "../export/canvas-backend";

/**
 * Lettering to stitches (G-081): a line of text in a face, at a size in stitches, drawn at one pixel to one cell and cut to
 * whole cells. Whatever the browser's text engine draws is anti-aliased; a stitch is there or it is not, so every pixel whose
 * coverage reaches a threshold is a stitch and the rest are not. The threshold is what the Weight slider moves.
 *
 * Pure apart from the context it is handed: the page gives it a canvas of its own, a test gives it a Node canvas, and the
 * same lettering comes out of both. Nothing here knows about a chart, a thread or a selection.
 */

/** A face as the browser describes one: a family, and the weight, slant and width of the face of it in use. */
export interface TextFace {
  family: string;
  /** CSS weight, 100 to 900. */
  weight: number;
  style: "normal" | "italic";
  /** A CSS font-stretch keyword: "normal", "condensed", "expanded" and the others. */
  stretch: string;
}

export interface LetteringOptions {
  face: TextFace;
  /** The font size in stitches: the em, so capitals are about three quarters of it. */
  size: number;
  /** 0 to 100. 50 cuts at half coverage; more makes heavier letters, less lighter ones. */
  weight: number;
}

/** The stitches of a piece of lettering, trimmed to its ink: `ink[y * width + x]` is 1 where there is a stitch. */
export interface LetteringBitmap {
  width: number;
  height: number;
  ink: Uint8Array;
}

/** The smallest em the legibility review allows (docs/reviews/2026-10-01-text-legibility.md): capitals of about 5 stitches. */
export const MIN_SIZE = 7;
export const MAX_SIZE = 200;
export const MAX_TEXT_LENGTH = 100;
export const DEFAULT_WEIGHT = 50;

/** A canvas context of `width` × `height` pixels, with nothing drawn on it. */
export type ContextFactory = (width: number, height: number) => Canvas2D;

/** The coverage, 0 to 1, a pixel needs to become a stitch: weight 50 is a half, and the ends are not quite all or none. */
export function coverageThreshold(weight: number): number {
  const w = Math.max(0, Math.min(100, Number.isFinite(weight) ? weight : DEFAULT_WEIGHT));
  return Math.max(0.05, Math.min(0.95, 1 - w / 100));
}

/** The generic families, which name the browser's own choice and so must not be quoted. */
const GENERIC = new Set(["sans-serif", "serif", "monospace", "cursive", "fantasy", "system-ui"]);

function quote(family: string): string {
  if (GENERIC.has(family)) return family;
  return `"${family.replace(/["\\]/g, "")}"`;
}

/** The CSS font shorthand for a face at a size in pixels, with a generic family behind it for a name that is not there. */
export function fontShorthand(face: TextFace, size: number): string {
  const stretch = face.stretch && face.stretch !== "normal" ? ` ${face.stretch}` : "";
  return `${face.style} ${Math.round(face.weight)}${stretch} ${size}px ${quote(face.family)}, sans-serif`;
}

/**
 * The lettering for `lines` (one line in the first version, a list so more can come), or null when it has no ink: no text, or
 * a space. Throws RangeError for a size or a length outside the limits above, which the interface keeps out.
 */
export function letteringCells(lines: readonly string[], options: LetteringOptions, createContext: ContextFactory): LetteringBitmap | null {
  const { face, size, weight } = options;
  if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE)
    throw new RangeError(`Size must be a whole number from ${MIN_SIZE} to ${MAX_SIZE}.`);
  const text = lines.filter((line) => line.length > 0);
  if (text.length === 0) return null;
  if (text.some((line) => line.length > MAX_TEXT_LENGTH)) throw new RangeError(`A line of text is at most ${MAX_TEXT_LENGTH} characters.`);

  const font = fontShorthand(face, size);
  const probe = createContext(1, 1);
  probe.font = font;
  let left = 0;
  let right = 0;
  let ascent = 0;
  let descent = 0;
  for (const line of text) {
    const m = probe.measureText(line);
    left = Math.max(left, m.actualBoundingBoxLeft);
    right = Math.max(right, m.actualBoundingBoxRight, m.width);
    ascent = Math.max(ascent, m.actualBoundingBoxAscent);
    descent = Math.max(descent, m.actualBoundingBoxDescent);
  }
  const pad = 2;
  const lineHeight = Math.ceil(size * 1.2);
  const width = Math.ceil(left + right) + pad * 2;
  const height = pad * 2 + Math.ceil(ascent) + Math.ceil(descent) + (text.length - 1) * lineHeight;
  const ctx = createContext(width, height);
  ctx.font = font;
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  text.forEach((line, i) => ctx.fillText(line, pad + left, pad + Math.ceil(ascent) + i * lineHeight));

  const { data } = ctx.getImageData(0, 0, width, height);
  const cut = Math.max(1, Math.round(coverageThreshold(weight) * 255));
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] < cut) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  const outWidth = x1 - x0 + 1;
  const outHeight = y1 - y0 + 1;
  const ink = new Uint8Array(outWidth * outHeight);
  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      if (data[((y + y0) * width + x + x0) * 4 + 3] >= cut) ink[y * outWidth + x] = 1;
    }
  }
  return { width: outWidth, height: outHeight, ink };
}

/** How many stitches the lettering has. */
export function inkCount(bitmap: LetteringBitmap): number {
  let count = 0;
  for (const cell of bitmap.ink) count += cell;
  return count;
}
