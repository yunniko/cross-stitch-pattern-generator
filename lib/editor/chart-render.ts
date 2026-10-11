import { STITCH_WHOLE } from "./stitch-kind";
import { halfStitchPolygon } from "../export/half-stitch-shape";
import { colorAt } from "../color/palette";
import { createCanvas, type AnyCanvas, type Canvas2D } from "./canvas-backend";
import { hexToRgb, luminance } from "../color/color";
import { EMPTY_CELL, type StitchPattern, type RGB } from "../types";

export type RenderMode = "color" | "bw";

// Below this, grid lines/symbols are illegible noise rather than helpful
// detail — line weights collapse to 1px and symbols stop being drawn
// (domain-expert review, HANDOVER.md D7).
export const LEGIBILITY_FLOOR_PX = 6;

// A pinned system font stack instead of bare "sans-serif" — the domain-expert
// review flagged a real (if unverified in this session) emoji-fallback risk
// for some of the curated dingbat symbols (e.g. a heart or star could render
// as a colored emoji glyph on some platforms' fallback fonts instead of the
// plain glyph every other symbol uses). Arial/Segoe UI are both installed by
// default on the large majority of desktop platforms this runs on and don't
// substitute emoji presentations for these code points. See HANDOVER.md D12.
export const FONT_STACK = "Arial, 'Segoe UI', sans-serif";

export const GRID_LINE_COLOR = "#333333";
// Line weights scale with cell size (a constant 1/2/3px reads as noise once
// cells shrink toward the max-stitch-count end of the range) — ratios
// chosen so the previous fixed 1/2/3px come out unchanged at the default
// 24px cell size (HANDOVER.md D7).
const MINOR_LINE_RATIO = 1 / 24;
const MEDIUM_LINE_RATIO = 2 / 24;
const MAJOR_LINE_RATIO = 3 / 24;
// The on-screen grid's half-pixel edge alpha (D135): 127/255 lands within one level of an anti-aliased stroke's edge.
const HALF_PIXEL_ALPHA = 127 / 255;

// B&W cells are compressed into this lightness band rather than the full
// 0-255 luminance range, so every cell stays light enough to print cleanly,
// use little ink, and take a highlighter — the actual point of a B&W chart
// (domain-expert review, HANDOVER.md D7). Symbols stay solid black always.
const BW_MIN_GRAY = 150;
const BW_MAX_GRAY = 245;

/**
 * One stitch cell at `(px, py)`: a whole stitch is the square in `fill`; a half stitch is the empty-stitch colour first and
 * then what is left of the square once two opposite corners are cut away (G-082, D259).
 */
export function fillStitchCell(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  cellSize: number,
  fill: string,
  kind: number,
  emptyCellColor: string
) {
  if (kind === STITCH_WHOLE) {
    ctx.fillStyle = fill;
    ctx.fillRect(px, py, cellSize, cellSize);
    return;
  }
  ctx.fillStyle = emptyCellColor;
  ctx.fillRect(px, py, cellSize, cellSize);
  ctx.fillStyle = fill;
  ctx.beginPath();
  halfStitchPolygon(kind, cellSize).forEach(([x, y], i) => (i === 0 ? ctx.moveTo(px + x, py + y) : ctx.lineTo(px + x, py + y)));
  ctx.closePath();
  ctx.fill();
}

function bwGray(rgb: RGB): number {
  const t = luminance(rgb) / 255;
  return Math.round(BW_MIN_GRAY + t * (BW_MAX_GRAY - BW_MIN_GRAY));
}

function fillForCell(mode: RenderMode, rgb: RGB): string {
  if (mode === "color") return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  const gray = bwGray(rgb);
  return `rgb(${gray}, ${gray}, ${gray})`;
}

function symbolTextColor(mode: RenderMode, rgb: RGB): string {
  if (mode === "bw") return "#000000";
  return luminance(rgb) > 140 ? "#000000" : "#ffffff";
}

/** A rectangular range of the pattern's own global stitch coordinates, end-exclusive. */
export interface ChartRegion {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Draws the grid (fills, symbols, gridlines) for `region` of `pattern` --
 * defaults to the whole pattern, so every existing caller is unaffected.
 * Grid-line weight (every 5th/10th heavier) and cell positions are always
 * computed from the pattern's own **global** coordinates, not local to the
 * region -- so a region starting at, say, stitch 70 still draws its major
 * gridline at the correct spot rather than restarting the 1/5/10 pattern
 * from its own edge. This is what lets `lib/a4-export.ts` render a single
 * A4 page's fragment of a much larger pattern using this exact function,
 * with no separate cell/symbol/color drawing logic (Owner's spec,
 * requirement 15).
 */
/**
 * One RGBA byte quadruple per cell, true scale (1 cell = 1 pixel, no grid
 * lines or symbols -- illegible at that size anyway) -- feeds the
 * Preview/navigator dock's `ImageData` directly (G-012). A pure function,
 * not a DOM-drawing one, so the actual pixel derivation is unit-testable
 * without a canvas.
 */
export function renderNavigatorPixels(pattern: StitchPattern, emptyCellColor: string = "#ffffff"): Uint8ClampedArray {
  const { cellPalette, palette } = pattern;
  const data = new Uint8ClampedArray(cellPalette.length * 4);
  const emptyRgb = hexToRgb(emptyCellColor);
  for (let i = 0; i < cellPalette.length; i++) {
    const paletteIndex = cellPalette[i];
    // The empty-stitch sentinel has no palette entry -- defaults to blank
    // white, same as every export path (G-012 M5); the live navigator
    // preview passes the Owner's own view-only "canvas color" (2026-09-12)
    // so it matches the main canvas, never plumbed into any export.
    const [r, g, b] = paletteIndex === EMPTY_CELL ? emptyRgb : colorAt(palette, paletteIndex).rgb;
    const o = i * 4;
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = 255;
  }
  return data;
}

export function drawChart(
  ctx: CanvasRenderingContext2D,
  pattern: StitchPattern,
  mode: RenderMode,
  cellSize: number,
  region?: ChartRegion,
  /** Fill for the empty-stitch sentinel: the view's canvas colour (Owner, 2026-09-12), or `CLEAR_EMPTY` over the photo. */
  emptyCellColor: string = "#ffffff",
  /** The Symbols switch (G-110). */
  symbols = true
) {
  const { width, height, cellPalette, palette, cellKind } = pattern;
  const { x0, y0, x1, y1 } = region ?? { x0: 0, y0: 0, x1: width, y1: height };
  const drawSymbols = symbols && cellSize >= LEGIBILITY_FLOOR_PX;

  if (drawSymbols) {
    ctx.font = `${Math.round(cellSize * 0.6)}px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
  }

  // The same strings `fillForCell` and `symbolTextColor` return, built once per palette entry instead of per stitch
  // (G-036 M2).
  const fills = palette.map((color) => fillForCell(mode, color.rgb));
  const textColors = drawSymbols ? palette.map((color) => symbolTextColor(mode, color.rgb)) : [];

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const paletteIndex = cellPalette[y * width + x];
      const localX = (x - x0) * cellSize;
      const localY = (y - y0) * cellSize;

      // The empty-stitch sentinel (G-012 M5) has no palette entry -- render
      // it as plain blank (white by default), not "the first color by accident."
      if (paletteIndex === EMPTY_CELL) {
        ctx.fillStyle = emptyCellColor;
        ctx.fillRect(localX, localY, cellSize, cellSize);
        continue;
      }

      fillStitchCell(ctx, localX, localY, cellSize, fills[paletteIndex], cellKind?.[y * width + x] ?? STITCH_WHOLE, emptyCellColor);

      if (drawSymbols) {
        ctx.fillStyle = textColors[paletteIndex];
        ctx.fillText(colorAt(palette, paletteIndex).symbol, localX + cellSize / 2, localY + cellSize / 2 + 1);
      }
    }
  }

  drawGridLines(ctx, x0, y0, x1, y1, cellSize);
}

/** The exact bytes a canvas fills for a CSS colour, read back from a 1×1 probe; `null` unless it is fully opaque. */
// Parsing a CSS colour means a 1 x 1 canvas and a readback; a drag asks for the same colour on every frame (G-039 M2).
const opaqueRgbCache = new Map<string, RGB | null>();

function opaqueCanvasRgb(color: string): RGB | null {
  const cached = opaqueRgbCache.get(color);
  if (cached !== undefined) return cached;
  let ctx: Canvas2D;
  try {
    ({ ctx } = createCanvas(1, 1));
  } catch {
    return null;
  }
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  const rgb = a === 255 ? ([r, g, b] as RGB) : null;
  opaqueRgbCache.set(color, rgb);
  return rgb;
}

/** The reused scratch canvas and pixel buffer for `drawStitchPixels`, keyed by the size it was made for. */
let stitchScratch: { canvas: AnyCanvas; ctx: Canvas2D; w: number; h: number; image: ImageData } | null = null;

/** Writes one pixel per stitch of `region` into a scratch canvas and scales it onto `ctx` with nearest-neighbour sampling. */
function drawStitchPixels(
  ctx: CanvasRenderingContext2D,
  region: ChartRegion,
  cellSize: number,
  pixelAt: (cellIndex: number, out: Uint8ClampedArray, offset: number) => void,
  width: number
): boolean {
  const w = region.x1 - region.x0;
  const h = region.y1 - region.y0;
  if (w <= 0 || h <= 0) return true;
  let scratch: AnyCanvas;
  let sctx: Canvas2D;
  // One scratch canvas and one buffer per size, reused across frames: a drag redraws the same rectangle every time,
  // and each frame would otherwise allocate both again (G-039 M2).
  if (stitchScratch && stitchScratch.w === w && stitchScratch.h === h) {
    ({ canvas: scratch, ctx: sctx } = stitchScratch);
  } else {
    try {
      ({ canvas: scratch, ctx: sctx } = createCanvas(w, h));
    } catch {
      return false;
    }
    stitchScratch = { canvas: scratch, ctx: sctx, w, h, image: sctx.createImageData(w, h) };
  }
  const image = stitchScratch.image;
  const data = image.data;
  for (let y = 0; y < h; y++) {
    const row = (region.y0 + y) * width;
    for (let x = 0; x < w; x++) pixelAt(row + region.x0 + x, data, (y * w + x) * 4);
  }
  sctx.putImageData(image, 0, 0);
  const smoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(scratch as CanvasImageSource, 0, 0, w, h, 0, 0, w * cellSize, h * cellSize);
  ctx.imageSmoothingEnabled = smoothing;
  return true;
}

/**
 * The on-screen chart (G-036 M2): identical pixels to `drawChart`, faster below the symbol floor. There every stitch
 * is a solid, opaque, integer-aligned square, so one pixel per stitch scaled up with nearest-neighbour sampling gives
 * the same bytes as one `fillRect` per stitch, in about 20 ms instead of about 370 ms at 1000 × 750. Grid lines are
 * drawn as before. With symbols, or an empty-stitch colour that isn't opaque, it is `drawChart` unchanged. Parity:
 * tests/e2e/chart-render-parity.spec.ts.
 */
/** The empty-stitch colour that leaves an empty stitch unpainted, for a chart drawn over something (D316). */
export const CLEAR_EMPTY = "transparent";

export function drawChartOnScreen(
  ctx: CanvasRenderingContext2D,
  pattern: StitchPattern,
  mode: RenderMode,
  cellSize: number,
  region?: ChartRegion,
  emptyCellColor: string = "#ffffff",
  /** The Symbols switch (G-110): without symbols every stitch is a solid square at any size, so the fast path serves. */
  symbols = true
) {
  // The one-pixel-per-stitch fast path cannot draw a cut corner, so a chart with half stitches takes the exact path.
  const solidSquares = (cellSize < LEGIBILITY_FLOOR_PX || !symbols) && !pattern.cellKind;
  // Over the photo an empty stitch is left clear, so the photo shows through it as it did under Grid + photo (D316).
  const clearEmpty = emptyCellColor === CLEAR_EMPTY;
  const emptyRgb = solidSquares ? (clearEmpty ? ([0, 0, 0] as RGB) : opaqueCanvasRgb(emptyCellColor)) : null;
  const emptyAlpha = clearEmpty ? 0 : 255;
  const { width, height, cellPalette, palette } = pattern;
  const r = region ?? { x0: 0, y0: 0, x1: width, y1: height };
  if (!emptyRgb) {
    drawChart(ctx, pattern, mode, cellSize, region, emptyCellColor, symbols);
    return;
  }
  const colors = palette.map((color): RGB => {
    if (mode === "color") return color.rgb;
    const gray = bwGray(color.rgb);
    return [gray, gray, gray];
  });
  const drawn = drawStitchPixels(
    ctx,
    r,
    cellSize,
    (cellIndex, out, o) => {
      const paletteIndex = cellPalette[cellIndex];
      const empty = paletteIndex === EMPTY_CELL;
      const rgb = empty ? emptyRgb : colors[paletteIndex];
      out[o] = rgb[0];
      out[o + 1] = rgb[1];
      out[o + 2] = rgb[2];
      out[o + 3] = empty ? emptyAlpha : 255;
    },
    width
  );
  if (!drawn) {
    drawChart(ctx, pattern, mode, cellSize, region, emptyCellColor, symbols);
    return;
  }
  drawGridLines(ctx, r.x0, r.y0, r.x1, r.y1, cellSize);
}

/**
 * Redraws one cell of a full-pattern chart in place (fill, symbol, and the
 * four gridline segments around it, since the fill overpaints half of
 * each) -- the incremental step a brush stroke or a dragged selection
 * takes per changed cell instead of repainting the whole canvas (D104).
 * `paletteIndex` is drawn rather than read from `pattern.cellPalette`, so
 * a gesture's working buffer can be previewed without building a pattern.
 * Only valid for a chart drawn by `drawChart` with no region offset.
 */
export function drawCell(
  ctx: CanvasRenderingContext2D,
  pattern: StitchPattern,
  mode: RenderMode,
  cellSize: number,
  x: number,
  y: number,
  paletteIndex: number,
  emptyCellColor: string = "#ffffff",
  /** The stitch kind to draw (G-082), given rather than read from `pattern` for the same reason `paletteIndex` is. */
  kind: number = STITCH_WHOLE,
  /** The screen's Symbols switch (G-110). */
  symbols = true
) {
  const px = x * cellSize;
  const py = y * cellSize;
  if (paletteIndex === EMPTY_CELL) {
    ctx.fillStyle = emptyCellColor;
    ctx.fillRect(px, py, cellSize, cellSize);
  } else {
    const color = colorAt(pattern.palette, paletteIndex);
    fillStitchCell(ctx, px, py, cellSize, fillForCell(mode, color.rgb), kind, emptyCellColor);
    if (symbols && cellSize >= LEGIBILITY_FLOOR_PX) {
      ctx.font = `${Math.round(cellSize * 0.6)}px ${FONT_STACK}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = symbolTextColor(mode, color.rgb);
      ctx.fillText(color.symbol, px + cellSize / 2, py + cellSize / 2 + 1);
    }
  }
  drawGridLines(ctx, x, y, x + 1, y + 1, cellSize, px, py);
}

/**
 * Shared by `drawChart` and `drawCell` -- gridline
 * weight (every 5th/10th heavier) and spacing, independent of what (if
 * anything) is drawn underneath. `originX`/`originY` is where cell
 * (x0, y0) sits on the canvas: 0 for a region drawn at the origin, the
 * cell's own pixel position for an in-place single-cell redraw.
 */
function drawGridLines(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  cellSize: number,
  originX = 0,
  originY = 0
) {
  const minorWidth = Math.max(1, Math.round(cellSize * MINOR_LINE_RATIO));
  const mediumWidth = Math.max(1, Math.round(cellSize * MEDIUM_LINE_RATIO));
  const majorWidth = Math.max(1, Math.round(cellSize * MAJOR_LINE_RATIO));

  // The rectangle a butt-capped stroke would cover, filled without anti-aliasing: whole pixels opaque and, for an odd
  // width, the half pixel on each side at alpha 127/255, the value closest to Chromium's own half-pixel coverage.
  // Nothing then depends on the canvas size or offset (D135).
  const fill = ctx.fillStyle;
  const alpha = ctx.globalAlpha;
  ctx.fillStyle = GRID_LINE_COLOR;
  const band = (centre: number, w: number, from: number, length: number, vertical: boolean) => {
    const rect = (at: number, size: number) => (vertical ? ctx.fillRect(at, from, size, length) : ctx.fillRect(from, at, length, size));
    if (w % 2 === 0) {
      rect(centre - w / 2, w);
      return;
    }
    if (w > 1) rect(centre - (w - 1) / 2, w - 1);
    ctx.globalAlpha = alpha * HALF_PIXEL_ALPHA;
    rect(centre - (w + 1) / 2, 1);
    rect(centre + (w - 1) / 2, 1);
    ctx.globalAlpha = alpha;
  };
  for (let x = x0; x <= x1; x++) {
    band(
      originX + (x - x0) * cellSize,
      x % 10 === 0 ? majorWidth : x % 5 === 0 ? mediumWidth : minorWidth,
      originY,
      (y1 - y0) * cellSize,
      true
    );
  }
  for (let y = y0; y <= y1; y++) {
    band(
      originY + (y - y0) * cellSize,
      y % 10 === 0 ? majorWidth : y % 5 === 0 ? mediumWidth : minorWidth,
      originX,
      (x1 - x0) * cellSize,
      false
    );
  }
  ctx.fillStyle = fill;
}

// A dark "spotlight" mask over everything *not* highlighted reads more
// clearly at a glance than brightening the matches themselves would --
// works the same regardless of which colors/how many are underneath.
// Exported since G-073 M4: backstitch dims itself to the same strength, and two numbers would drift apart.
export const HIGHLIGHT_MASK_ALPHA = 0.6;

/**
 * Candidate raster highlight mask (G-036 M2): the same dimming as `drawHighlightOverlay`, composited from one pixel
 * per stitch. Used on screen only if tests/e2e/chart-render-parity.spec.ts shows it byte-identical to per-stitch
 * `fillRect` compositing; otherwise `drawHighlightOverlay` stays.
 */
export function drawHighlightOverlayRaster(
  ctx: CanvasRenderingContext2D,
  pattern: StitchPattern,
  cellSize: number,
  highlightedIndices: ReadonlySet<number>,
  region?: ChartRegion
) {
  const { width, height, cellPalette } = pattern;
  const alpha = Math.round(HIGHLIGHT_MASK_ALPHA * 255);
  const r = region ?? { x0: 0, y0: 0, x1: width, y1: height };
  const drawn = drawStitchPixels(
    ctx,
    r,
    cellSize,
    (cellIndex, out, o) => {
      out[o] = 0;
      out[o + 1] = 0;
      out[o + 2] = 0;
      out[o + 3] = highlightedIndices.has(cellPalette[cellIndex]) ? 0 : alpha;
    },
    width
  );
  if (!drawn) {
    // The per-stitch fallback covers the whole pattern at the origin; a region is drawn at its own origin as above.
    ctx.save();
    ctx.translate(-r.x0 * cellSize, -r.y0 * cellSize);
    drawHighlightOverlay(ctx, pattern, cellSize, highlightedIndices);
    ctx.restore();
  }
}

/**
 * The farthest any on-screen chart paint reaches past its own stitch, in pixels: a symbol glyph extending beyond the
 * cell, or half the widest gridline. The viewport canvas
 * draws this many pixels' worth of extra stitches around its bitmap so every pixel matches a full-chart render (D135).
 */
export function chartPaintOverhangPx(ctx: CanvasRenderingContext2D, pattern: StitchPattern, cellSize: number): number {
  let overhang = Math.ceil(Math.max(1, Math.round(cellSize * MAJOR_LINE_RATIO)) / 2);
  if (cellSize < LEGIBILITY_FLOOR_PX) return overhang + 1;
  ctx.save();
  ctx.font = `${Math.round(cellSize * 0.6)}px ${FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const half = cellSize / 2;
  for (const color of pattern.palette) {
    const m = ctx.measureText(color.symbol);
    // Glyphs are drawn at (cell centre x, cell centre y + 1).
    const reach = Math.max(
      m.actualBoundingBoxLeft - half,
      m.actualBoundingBoxRight - half,
      m.actualBoundingBoxAscent - 1 - half,
      m.actualBoundingBoxDescent + 1 - half
    );
    overhang = Math.max(overhang, Math.ceil(reach));
  }
  ctx.restore();
  // One more pixel for antialiasing at the edge of any stroke or glyph.
  return overhang + 1;
}

/**
 * The Highlight tool (G-012): dims every stitch whose color isn't in
 * `highlightedIndices`, making the selected color(s) visually pop by
 * contrast, without altering the pattern itself -- draw this over
 * whatever `drawCurrentView` already rendered (color/B&W/photo), it's a
 * pure overlay. Deliberately not available for the async "Realistic
 * preview" mode -- that mode already isn't live/interactive the way the
 * others are, and retrofitting it to accept an overlay would mean
 * reworking its whole async, off-canvas render path for one secondary
 * tool.
 */
export function drawHighlightOverlay(
  ctx: CanvasRenderingContext2D,
  pattern: StitchPattern,
  cellSize: number,
  highlightedIndices: ReadonlySet<number>
) {
  const { width, height, cellPalette } = pattern;
  ctx.fillStyle = `rgba(0, 0, 0, ${HIGHLIGHT_MASK_ALPHA})`;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (highlightedIndices.has(cellPalette[y * width + x])) continue;
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }
}
