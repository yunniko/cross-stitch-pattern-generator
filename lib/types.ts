import type { EnhancementModeId } from "./editor/legacy-enhancement";
import type { PhotoAdjust } from "./pipeline/photo-adjust";
import type { DitherMode } from "./pipeline/dither";
import type { DitherTexture } from "./pipeline/dither-hand-drawn";
import type { EdgeMode } from "./pipeline/generation-modes";
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

/**
 * The thread a palette color is, by system (brand) and number (G-033, D122). Picked from a catalogue, the number is the table's;
 * typed by hand (G-131), it may be a number no catalogue here lists (`threadIdentity`). Immutable: replace it, never mutate it.
 */
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
  /** The thread this color is; absent for a color with no thread. Its RGB need not equal the table's (Anchor carries DMC RGB, and a typed number never changes the color). */
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

/**
 * A backstitch line (G-073): straight, corner to corner, drawn over the crosses.
 *
 * Coordinates are grid **corners**, so a chart `width` stitches across has corners `0..width` inclusive. That
 * is also how OXS stores a backstitch, which is why export is exact. There is no curve and no width here — the
 * fifth-of-a-cell stroke is a drawing decision, not part of the stitch.
 */
export interface BackstitchLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Indexes `palette`: one thread serves both crosses and backstitch, counted separately (Owner, 2026-09-25). */
  paletteIndex: number;
}

/**
 * A colour of a palette (G-087, G-131 D397): its colour, the name a chart shows for it, and the thread it is, of any system,
 * listed or typed. The thread is what identifies it; a colour with none is known by its RGB.
 */
export interface PaletteSetColor {
  rgb: RGB;
  /** The name as a chart shows it ("321 - Red", or the user's own). Absent: the thread's catalogue name, or none. */
  name?: string;
  source?: ThreadSwatchRef;
}

/**
 * The set of colours a chart records of the generation that made it (G-087, D277): the set, in the palette mode it belongs to, and
 * whether the chart was made from it. Separate from the chart's own palette, which editing changes and the set never follows.
 */
export interface GenerationPalette {
  mode: "full" | ThreadBrand;
  colors: PaletteSetColor[];
  active: boolean;
}

export interface StitchPattern {
  width: number;
  height: number;
  /** Length width*height, row-major; each value indexes `palette` or is `EMPTY_CELL`. */
  cellPalette: Uint8Array;
  /**
   * Half stitches (G-082): for each cell, 0 a whole stitch, 1 a half stitch "/", 2 a half stitch "\\" (`lib/editor/stitch-kind.ts`).
   * Same length and indexing as `cellPalette`. **Absent means every stitch is whole**, which is every chart made before G-082
   * and every chart that has no half stitch; an empty cell is always 0.
   */
  cellKind?: Uint8Array;
  palette: PaletteColor[];
  /** True when the source image is wider than it is tall. */
  isLandscape: boolean;
  /** Drives every download filename; callers fall back to a default when absent. */
  name?: string;
  /** Absent for a pattern with no associated photo, such as one saved before G-012. */
  sourceImage?: SourceImageRef;
  /**
   * The brand a chart was generated in (D92), kept for what it tells: the thread picker opens on it. It no longer limits the
   * chart (G-131): any color may be any system's thread, or none.
   */
  threadBrand?: ThreadBrand;
  /** The set of colours the Owner chose for the generation of this chart, kept with it (G-087); absent on a chart made without one. */
  generationPalette?: GenerationPalette;
  /** Set when generated in Crisp or Crisp+ mode. Informational only; absent means Standard (G-024, G-038). */
  edgeMode?: Extract<EdgeMode, "crisp" | "crisp-plus">;
  /**
   * The photo enhancement a chart was generated with, for charts made before G-074 M4 removed the five
   * modes (D240). Read and kept, never written: nothing generates it now.
   */
  enhancementMode?: Exclude<EnhancementModeId, "off">;
  /** The dither pattern the chart was generated with (G-052). Informational; absent means none. */
  ditherMode?: Exclude<DitherMode, "off">;
  /** What the drawn marks were made of (G-055); absent for every other pattern, and for the default texture. */
  ditherTexture?: DitherTexture;
  /** Generated with Vivid (G-061). Informational; absent means the stitches are plain area means. */
  vivid?: true;
  /** The four photo sliders the chart was generated with (G-074); absent when they were all centred. */
  photoAdjust?: PhotoAdjust;
  /** Backstitch lines drawn over the crosses (G-073); absent for a chart with none. */
  backstitch?: BackstitchLine[];
  /**
   * The fabric the chart is for (G-094, D290): absent on a chart saved before it and never given one, which then takes the
   * browser's own count and unit.
   */
  fabric?: ChartFabric;
}

/** A chart's fabric: its count in stitches per inch, and the unit its finished size is shown in. */
export interface ChartFabric {
  count: number;
  unit: "in" | "cm";
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
  /** The stitch kind of each cell, like `StitchPattern.cellKind` (G-082); absent means all whole. Travels with `cells`: a flip or a turn swaps "/" and "\\" where it should. */
  kinds?: Uint8Array;
  /**
   * Which cells of the `width` x `height` box are actually in the piece, 1 for in (G-072). **Absent means all of
   * them**, which is what every rectangle selection is and why nothing about them had to change.
   *
   * It travels with `cells`: a flip flips it, a rotation rotates it, and a cell it excludes is never stamped, never
   * vacated and never filled.
   */
  mask?: Uint8Array;
  /**
   * Transparency as colour (G-119, D359): the piece's empty stitches cover what they land on, as any colour does. Absent
   * or false, they leave what lies beneath. The selection tools set it from their switch; `stampsCell` reads it.
   */
  emptyCovers?: boolean;
  originRect?: CellRect;
  /**
   * The mask as it was when the piece was lifted, in `originRect`'s own box, so a merge vacates the shape rather
   * than its bounding rectangle. Absent means the whole rect.
   *
   * Separate from `mask` because it must *not* follow the piece: `originRect` keeps the box the piece came from, so
   * after a rotation `mask` describes the turned piece while this still describes the hole it left behind.
   */
  originMask?: Uint8Array;
  /**
   * The backstitch travelling with the piece (G-073 M3), in the piece's own corner coordinates: `0` is its
   * left edge, `width` its right. Kept local so a flip, a turn and a move need no knowledge of where the
   * piece currently sits.
   *
   * By default a line is taken only when both its ends are inside the piece (`lineWithinRect`); a lift may name the
   * lines instead, such as every line of one colour (G-116). The rest stay on the
   * chart. Like the cells, these are copied at lift and the originals are cleared at merge, not before.
   */
  backstitch?: readonly BackstitchLine[];
  /**
   * The chart's lines this piece took when it was lifted, as they lie on the chart (G-116, D330): exactly these are
   * cleared at merge. Absent means none were taken; like `originRect`, a duplicate or a paste has none.
   */
  originLines?: readonly BackstitchLine[];
}
