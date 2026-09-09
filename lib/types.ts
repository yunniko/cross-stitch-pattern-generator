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
