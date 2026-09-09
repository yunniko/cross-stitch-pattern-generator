export type RGB = readonly [number, number, number];

/**
 * Structurally compatible with the DOM's `ImageData` (same `data`/`width`/
 * `height` shape) but declared independently so pipeline modules stay
 * unit-testable in plain Node/Vitest without a jsdom/browser environment —
 * same pattern as `image-object-splitter`'s `PixelBuffer`.
 */
export interface PixelBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * One RGB triple per stitch cell, stored interleaved (`[r,g,b,r,g,b,...]`)
 * rather than as an `RGB[]` array of tuples — avoids allocating up to a
 * million small arrays/objects at the largest grid size, which otherwise
 * dominates GC time in the optimizer (codex critique, HANDOVER.md D6).
 */
export interface CellColorBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export function cellRgb(buffer: CellColorBuffer, cellIndex: number): RGB {
  const o = cellIndex * 3;
  return [buffer.data[o], buffer.data[o + 1], buffer.data[o + 2]];
}

export type SizePresetId = "small" | "medium" | "large" | "custom";

export const SIZE_PRESETS: Record<Exclude<SizePresetId, "custom">, number> = {
  small: 50,
  medium: 100,
  large: 150,
};

export const MIN_STITCHES = 10;
export const MAX_STITCHES = 1000;
export const MIN_COLORS = 2;
export const MAX_COLORS = 64;

export interface PaletteColor {
  /** Index into the palette array; also the index stored per cell. */
  index: number;
  rgb: RGB;
  symbol: string;
  /** Number of stitches using this color. */
  count: number;
}

export interface StitchPattern {
  width: number;
  height: number;
  /** Length width*height, row-major; each value is an index into `palette`. */
  cellPalette: Uint8Array;
  palette: PaletteColor[];
  /** True when the source image is wider than it is tall. */
  isLandscape: boolean;
}
