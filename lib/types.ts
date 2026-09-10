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
// Tied to SYMBOL_SET.length (lib/symbols.ts) -- every palette color needs
// its own symbol, so this can never exceed however many distinct symbols
// exist. Raised from 64 to 100 (2026-09-10, Owner request) alongside a
// larger symbol set and the ability to manually reassign/swap a color's
// symbol, which is the escape valve for whatever the automatic assignment
// gets wrong for a given palette.
export const MAX_COLORS = 100;

/**
 * The "empty stitch" sentinel (G-012 M5): a `cellPalette` value meaning
 * "nothing stitched here" -- for marking cells on a non-square photo that
 * shouldn't be stitched at all. Deliberately *not* a `PaletteColor` in
 * `palette` -- it never appears in the legend, never counts toward stitch
 * totals, and renders as blank in every mode/export. Fixed at the
 * `Uint8Array` max (255), comfortably above `MAX_COLORS` (100), so it can
 * never collide with a real palette index.
 */
export const EMPTY_CELL = 255;

export interface PaletteColor {
  /** Index into the palette array; also the index stored per cell. */
  index: number;
  rgb: RGB;
  symbol: string;
  /** Nearest name from a brand-neutral reference list; unique within one pattern's palette. */
  name: string;
  /** Number of stitches using this color. */
  count: number;
}

/**
 * The originally-uploaded photo, kept alongside the generated grid so the
 * editor can show it as reference underneath the symbol grid (G-012's
 * "Grid + photo" render mode) and so the Move tool can reposition the grid
 * relative to it. `dataUrl` is the file's own original bytes (untouched,
 * not re-encoded) -- deliberately not just the capped-resolution decode
 * `loadImageAsPixelBuffer` uses internally for generation, so reopening a
 * saved pattern shows the photo at its real original quality. Embedding
 * this in saved files was a deliberate Owner tradeoff (2026-09-10,
 * GOALS.md G-012): saved editable JSON files get much larger in exchange
 * for the photo/Move-tool workflow surviving a close-and-reopen.
 */
export interface SourceImageRef {
  dataUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  /**
   * Source-image pixels per stitch cell, fixed at generation/regenerate
   * time (derived from whatever `longerSideStitches` produced the current
   * grid) -- NOT recomputed on crop/expand/Move, so those operations only
   * need to adjust `offsetX`/`offsetY`, not this scale.
   */
  cellSizePx: number;
  /**
   * Stitch-cell-space offset of the photo's top-left pixel relative to
   * grid cell (0,0). Starts at (0,0) -- generation's own downsample is
   * always 1:1-aligned -- and is only ever changed by the Move tool or by
   * a canvas crop/expand (which must shift it by the same amount so the
   * photo doesn't visually jump).
   */
  offsetX: number;
  offsetY: number;
}

export interface StitchPattern {
  width: number;
  height: number;
  /** Length width*height, row-major; each value is an index into `palette`. */
  cellPalette: Uint8Array;
  palette: PaletteColor[];
  /** True when the source image is wider than it is tall. */
  isLandscape: boolean;
  /**
   * User-facing name driving every downloadable filename -- optional so
   * every existing spread-based mutation (`lib/pattern-edit.ts`) carries it
   * through automatically. Set once at generation/open time; UI call sites
   * should fall back to a sensible default when absent rather than treating
   * it as required.
   */
  name?: string;
  /** Absent for patterns generated/opened before G-012, or opened from a pre-G-012 save file -- the photo-underlay mode and Move tool are simply unavailable then. */
  sourceImage?: SourceImageRef;
  /**
   * True when every color in `palette` is a real DMC thread (G-013's
   * "dmc" generation mode; set by `applyDmcPalette`), persisted on the
   * pattern itself rather than inferred from the UI's transient mode
   * selector or by pattern-matching color names -- so a reopened/restored
   * pattern, or one whose colors were merged/edited since generation,
   * still reports its true state. Absent/false for every other pattern.
   * Drives whether "+ Add" restricts new colors to real DMC swatches
   * (G-016) and whether A4 exports show a "Color number"/"Thread: DMC"
   * section.
   */
  dmcMode?: boolean;
}
