import type { PaletteColor } from "../types";

/**
 * The one way to read a thread out of a palette by index (G-067 M5, STANDARDS.md → "An invariant is enforced where
 * it is assumed").
 *
 * The drawing paths all assume every `cellPalette` value is either `EMPTY_CELL` or a real index, which is true and
 * is kept true at the seam where cells are written (D217). This does not paint around a bad index — the renderers
 * stay strict on purpose, because a cell nothing can draw is a bug to find, not to hide. What it changes is what the
 * failure says: `palette has no colour 254 (the chart has 16)` instead of `Cannot read properties of undefined
 * (reading 'rgb')` from somewhere inside a canvas loop.
 *
 * That difference is the whole value. The one time this actually happened, the message was the only thing a reader
 * could send on, and it named neither the index nor the palette.
 */
export function colorAt(palette: readonly PaletteColor[], index: number): PaletteColor {
  const color = palette[index];
  if (!color) throw new Error(`palette has no colour ${index} (the chart has ${palette.length})`);
  return color;
}
