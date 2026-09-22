import type { EnhancementModeId } from "./pipeline/enhance";
import type { DitherMode } from "./pipeline/dither";
import type { DitherTexture } from "./pipeline/dither-hand-drawn";
import type { EdgeMode } from "./pipeline/pattern";
import type { ThreadBrand } from "./threads/thread-brands";

export type RGB = readonly [number, number, number];

/** Structurally compatible with the DOM `ImageData`, declared here so pipeline modules run in plain Node. */
export interface PixelBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** One RGB triple per stitch cell, interleaved, rather than a tuple per cell: avoids a million small allocations (D6). */
export interface CellColorBuffer {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export function cellRgb(buffer: CellColorBuffer, cellIndex: number): RGB {
  const o = cellIndex * 3;
  return [buffer.data[o], buffer.data[o + 1], buffer.data[o + 2]];
}

export type SizePresetId = "small" | "medium" | "large" | "xl" | "xxl" | "custom";

export const SIZE_PRESETS: Record<Exclude<SizePresetId, "custom">, number> = {
  small: 50,
  medium: 100,
  large: 150,
  xl: 200,
  xxl: 250,
};

export const SIZE_PRESET_LABELS: Record<Exclude<SizePresetId, "custom">, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
  xl: "XL",
  xxl: "XXL",
};

export const MIN_STITCHES = 10;
/**
 * The longest side a chart may have. 1500 is the largest size every export completes for every chart shape (the
 * full-chart PNG's layout budget, D026, refuses a square chart above about 1550) and generation stays inside its
 * deadline with three jobs at once on the host. Every size check in the app reads this one value (G-046 M4, D181).
 */
export const MAX_STITCHES = 1500;
export const MIN_COLORS = 2;
/** Bounded by `SYMBOL_SET.length`: every palette color needs its own symbol. */
export const MAX_COLORS = 100;

/** The "no stitch here" cell value: never a palette entry, never counted, blank in every render. It can't collide with a palette index (at most `MAX_COLORS`). */
export const EMPTY_CELL = 255;

/** Stitches actually made: every cell except `EMPTY_CELL`. Wherever a stitch count is shown, this is it; the canvas size stays width × height (D120). */
export function filledStitchCount(pattern: Pick<StitchPattern, "cellPalette">): number {
  let count = 0;
  for (const value of pattern.cellPalette) if (value !== EMPTY_CELL) count++;
  return count;
}

/** "1 stitch", "2,350 stitches"; used by every stitch-count display (D120). */
export function formatStitchCount(count: number): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? "stitch" : "stitches"}`;
}

/** "0 colors", "1 color", "24 colors"; shared by the on-screen header and the exported chart info, so they can't drift apart. */
export function formatColorCount(count: number): string {
  return `${count.toLocaleString("en-US")} ${count === 1 ? "color" : "colors"}`;
}

/** A catalogue thread a palette color was taken from, by brand and canonical table code (G-033, D122). Immutable: replace it, never mutate it. */
export interface ThreadSwatchRef {
  readonly brand: ThreadBrand;
  readonly code: string;
}

export interface PaletteColor {
  /** Index into the palette array; also the value stored per cell. */
  index: number;
  rgb: RGB;
  symbol: string;
  /** Unique within one pattern's palette. */
  name: string;
  /** Number of stitches using this color. */
  count: number;
  /** The thread this color was picked from; absent for a custom color. Its RGB need not equal the table's (Anchor carries DMC RGB). */
  source?: ThreadSwatchRef;
}

/**
 * The uploaded photo kept with the grid for the photo underlay and the Move tool. `dataUrl` holds the original file
 * bytes, not the capped decode used for generation, so a reopened pattern shows the photo at full quality (G-012).
 */
export interface SourceImageRef {
  dataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  /** Source pixels per stitch, fixed at generation; crop, expand and Move change only the offsets. */
  cellSizePx: number;
  /** Stitch-space offset of the photo's top-left pixel from cell (0,0). */
  offsetX: number;
  offsetY: number;
}

export interface StitchPattern {
  width: number;
  height: number;
  /** Length width*height, row-major; each value indexes `palette` or is `EMPTY_CELL`. */
  cellPalette: Uint8Array;
  palette: PaletteColor[];
  /** True when the source image is wider than it is tall. */
  isLandscape: boolean;
  /** Drives every download filename; callers fall back to a default when absent. */
  name?: string;
  /** Absent for a pattern with no associated photo, such as one saved before G-012. */
  sourceImage?: SourceImageRef;
  /** Set when every palette color is a real thread of this brand; drives "+ Add" and the A4 thread section (D92). */
  threadBrand?: ThreadBrand;
  /** Set when generated in Crisp or Crisp+ mode. Informational only; absent means Standard (G-024, G-038). */
  edgeMode?: Extract<EdgeMode, "crisp" | "crisp-plus">;
  /** The photo enhancement the pattern was generated with (G-032). Informational; absent means Off. */
  enhancementMode?: Exclude<EnhancementModeId, "off">;
  /** The dither pattern the chart was generated with (G-052). Informational; absent means none. */
  ditherMode?: Exclude<DitherMode, "off">;
  /** What the drawn marks were made of (G-055); absent for every other pattern, and for the default texture. */
  ditherTexture?: DitherTexture;
  /** Generated with Vivid (G-061). Informational; absent means the stitches are plain area means. */
  vivid?: true;
}

/** An axis-aligned, end-exclusive rectangle in stitch-cell coordinates. */
export interface CellRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The Select tool's floating piece (G-018): lifted cells, moved and flipped independently of the pattern until merged.
 * `originRect` is the area cleared on merge: set for a piece lifted from the canvas, absent for a pasted one.
 */
export interface FloatingSelection {
  x: number;
  y: number;
  width: number;
  height: number;
  cells: Uint8Array;
  originRect?: CellRect;
}
