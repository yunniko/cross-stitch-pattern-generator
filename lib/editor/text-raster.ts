import type { Canvas2D } from "./canvas-backend";

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
/** The size for a font with no size of its own to prefer: capitals of about 8 stitches, where the review says letters read. */
export const DEFAULT_SIZE = 12;

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

  // Each distinct character is drawn once, at a whole pixel, so the same letter is the same stitches wherever it stands:
  // drawing the line in one call puts every letter at a fractional x and the cut then rounds each one differently (D256).
  const glyphs = new Map<string, Glyph>();
  let ascent = 0;
  let descent = 0;
  for (const line of text) {
    for (const ch of new Set(line)) {
      const m = probe.measureText(ch);
      glyphs.set(ch, {
        advance: m.width,
        left: Math.max(0, Math.ceil(m.actualBoundingBoxLeft)),
        right: Math.ceil(m.actualBoundingBoxRight),
        ink: null,
      });
      ascent = Math.max(ascent, m.actualBoundingBoxAscent);
      descent = Math.max(descent, m.actualBoundingBoxDescent);
    }
  }
  ascent = Math.ceil(ascent);
  descent = Math.ceil(descent);
  const cut = Math.max(1, Math.round(coverageThreshold(weight) * 255));
  const rowHeight = ascent + descent;
  for (const [ch, glyph] of glyphs) {
    const w = glyph.left + glyph.right + 2;
    if (rowHeight === 0 || w <= 0) continue;
    const ctx = createContext(w, rowHeight);
    ctx.font = font;
    ctx.fillStyle = "#000000";
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillText(ch, glyph.left + 1, ascent);
    const { data } = ctx.getImageData(0, 0, w, rowHeight);
    const ink = new Uint8Array(w * rowHeight);
    for (let i = 0; i < ink.length; i++) ink[i] = data[i * 4 + 3] >= cut ? 1 : 0;
    glyph.ink = { width: w, ink };
  }

  const lineHeight = Math.ceil(size * 1.2);
  const pad = 2;
  const widthOf = (line: string) => {
    let pen = 0;
    let end = 0;
    for (const ch of line) {
      const g = glyphs.get(ch)!;
      end = Math.max(end, Math.round(pen) - g.left - 1 + (g.ink?.width ?? 0));
      pen += g.advance;
    }
    return Math.max(end, Math.round(pen));
  };
  const shift = Math.max(0, ...text.map((line) => (line.length ? glyphs.get([...line][0])!.left + 1 : 0)));
  const width = Math.max(...text.map(widthOf)) + shift + pad * 2;
  const height = pad * 2 + rowHeight + (text.length - 1) * lineHeight;
  const grid = new Uint8Array(width * height);
  text.forEach((line, row) => {
    let pen = 0;
    for (const ch of line) {
      const g = glyphs.get(ch)!;
      if (g.ink) {
        const ox = pad + shift + Math.round(pen) - g.left - 1;
        const oy = pad + row * lineHeight;
        for (let y = 0; y < rowHeight; y++) {
          for (let x = 0; x < g.ink.width; x++) {
            if (g.ink.ink[y * g.ink.width + x] && ox + x >= 0 && ox + x < width) grid[(oy + y) * width + ox + x] = 1;
          }
        }
      }
      pen += g.advance;
    }
  });

  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!grid[y * width + x]) continue;
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
      ink[y * outWidth + x] = grid[(y + y0) * width + x + x0];
    }
  }
  return { width: outWidth, height: outHeight, ink };
}

interface Glyph {
  advance: number;
  /** Whole pixels of ink left and right of the pen, so the glyph's own picture is `left + right + 2` wide. */
  left: number;
  right: number;
  ink: { width: number; ink: Uint8Array } | null;
}

/** How many stitches the lettering has. */
export function inkCount(bitmap: LetteringBitmap): number {
  let count = 0;
  for (const cell of bitmap.ink) count += cell;
  return count;
}
