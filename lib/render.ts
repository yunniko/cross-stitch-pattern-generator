import { luminance, rgbToHex } from "./color";
import { DEFAULT_AIDA_COUNT, DEFAULT_SIZE_UNIT, formatFinishedSize, type SizeUnit } from "./finished-size";
import { formatSkeinEstimate } from "./floss-estimate";
import { buildTintedTextureSet } from "./stitch-texture";
import { EMPTY_CELL, type PaletteColor, type StitchPattern, type RGB } from "./types";

export type RenderMode = "color" | "bw";

export interface RenderOptions {
  /** Preferred pixel size of one stitch cell before the max-canvas-size clamp applies. */
  cellSize?: number;
  /** Fabric count used for the header's finished-size estimate (see lib/finished-size.ts). */
  aidaCount?: number;
  /** Unit for the header's finished-size estimate. */
  sizeUnit?: SizeUnit;
  /** Shown in the header as "Designed by <name>" when non-blank (G-015). */
  authorName?: string;
}

const DEFAULT_CELL_SIZE = 24;
// Chrome/Firefox both choke well before this on canvas area; clamping keeps a
// 1000-stitch pattern (the spec's own upper bound) from ever producing a
// canvas the browser can't allocate. Not verified on every browser engine —
// see HANDOVER.md D7's cross-browser caveat.
const MAX_CANVAS_DIMENSION = 12000;

// Budgets for the *complete* printable chart -- grid plus header, legend,
// margins, and center-marker/number gutters -- not just the stitch grid
// itself. The old clamp (MAX_CANVAS_DIMENSION above) only bounded the grid;
// a supported 1000x1000/1-color pattern could still request a ~12,238x12,078
// canvas (~148 million pixels, ~564 MiB as one RGBA surface) once that chrome
// was added on top, with no check at all on total area (code-review
// 2026-09-09, finding 4). These numbers aren't a published spec value -- no
// browser guarantees a canvas-size ceiling -- chosen so the app's own
// existing max-supported case (1000x1000 stitches, 64 colors) still renders
// with symbols legible (cellSize stays above LEGIBILITY_FLOOR_PX), while
// still catching and refusing anything that would balloon further, rather
// than silently attempting a huge allocation. Deliberately not verified
// against iOS Safari's much stricter real-world limits (MDN cites ~4096px
// per side) -- this project doesn't state mobile/iOS support as a
// requirement; the fix here is "fail with a clear, catchable error instead
// of an unbounded allocation attempt," not "succeed on every device."
const MAX_CHART_DIMENSION_PX = 8000;
const MAX_CHART_AREA_PX = 40_000_000;
const MIN_CHART_CELL_SIZE_PX = 4;

/** Thrown when no cell size -- down to the legibility/practical floor -- keeps the complete chart within the size budgets above. */
export class ChartTooLargeError extends Error {
  constructor() {
    super(
      'This pattern is too large to render as a single image in your browser. Try a smaller pattern size, fewer colors, or use "Export as A4 pages" instead, which renders one printable page at a time.'
    );
    this.name = "ChartTooLargeError";
  }
}
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

// Tall enough for two text lines (name, then hex/count) next to the swatch —
// was 28px/one line before names were added.
const LEGEND_ITEM_HEIGHT = 40;
const LEGEND_SWATCH_SIZE = 20;
const LEGEND_PADDING = 16;
const LEGEND_COLUMN_WIDTH = 170;

// B&W cells are compressed into this lightness band rather than the full
// 0-255 luminance range, so every cell stays light enough to print cleanly,
// use little ink, and take a highlighter — the actual point of a B&W chart
// (domain-expert review, HANDOVER.md D7). Symbols stay solid black always.
const BW_MIN_GRAY = 150;
const BW_MAX_GRAY = 245;

// Space reserved outside the chart for the centre-marker arrows (all four
// sides) and the row/column numbers (top + left only) — a real, near-
// universal chart convention (arrows/triangles marking the design's centre
// as the conventional starting point; edge numbering for counting) that a
// domain-expert review flagged as the largest remaining craft-usability gap
// (HANDOVER.md D7/D12).
const MARKER_MARGIN = 16;
const NUMBER_MARGIN = 20;
const HEADER_HEIGHT = 26;

function effectiveCellSize(width: number, height: number, requested: number): number {
  const longerSide = Math.max(width, height);
  const maxByCanvas = Math.floor(MAX_CANVAS_DIMENSION / longerSide);
  return Math.max(4, Math.min(requested, maxByCanvas));
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
export function renderNavigatorPixels(pattern: StitchPattern): Uint8ClampedArray {
  const { cellPalette, palette } = pattern;
  const data = new Uint8ClampedArray(cellPalette.length * 4);
  for (let i = 0; i < cellPalette.length; i++) {
    const paletteIndex = cellPalette[i];
    // The empty-stitch sentinel has no palette entry -- render it as blank
    // white, same as every other render/export path (G-012 M5).
    const [r, g, b] = paletteIndex === EMPTY_CELL ? [255, 255, 255] : palette[paletteIndex].rgb;
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
  region?: ChartRegion
) {
  const { width, height, cellPalette, palette } = pattern;
  const { x0, y0, x1, y1 } = region ?? { x0: 0, y0: 0, x1: width, y1: height };
  const drawSymbols = cellSize >= LEGIBILITY_FLOOR_PX;

  if (drawSymbols) {
    ctx.font = `${Math.round(cellSize * 0.6)}px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
  }

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const paletteIndex = cellPalette[y * width + x];
      const localX = (x - x0) * cellSize;
      const localY = (y - y0) * cellSize;

      // The empty-stitch sentinel (G-012 M5) has no palette entry -- render
      // it as plain blank/white, not "the first color by accident."
      if (paletteIndex === EMPTY_CELL) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(localX, localY, cellSize, cellSize);
        continue;
      }

      const color = palette[paletteIndex];
      ctx.fillStyle = fillForCell(mode, color.rgb);
      ctx.fillRect(localX, localY, cellSize, cellSize);

      if (drawSymbols) {
        ctx.fillStyle = symbolTextColor(mode, color.rgb);
        ctx.fillText(color.symbol, localX + cellSize / 2, localY + cellSize / 2 + 1);
      }
    }
  }

  drawGridLines(ctx, x0, y0, x1, y1, cellSize);
}

/** Shared by `drawChart` and `drawChartOutline` -- gridline weight (every 5th/10th heavier) and spacing, independent of what (if anything) is drawn underneath. */
function drawGridLines(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, cellSize: number) {
  const minorWidth = Math.max(1, Math.round(cellSize * MINOR_LINE_RATIO));
  const mediumWidth = Math.max(1, Math.round(cellSize * MEDIUM_LINE_RATIO));
  const majorWidth = Math.max(1, Math.round(cellSize * MAJOR_LINE_RATIO));

  ctx.strokeStyle = GRID_LINE_COLOR;
  for (let x = x0; x <= x1; x++) {
    ctx.lineWidth = x % 10 === 0 ? majorWidth : x % 5 === 0 ? mediumWidth : minorWidth;
    ctx.beginPath();
    ctx.moveTo((x - x0) * cellSize, 0);
    ctx.lineTo((x - x0) * cellSize, (y1 - y0) * cellSize);
    ctx.stroke();
  }
  for (let y = y0; y <= y1; y++) {
    ctx.lineWidth = y % 10 === 0 ? majorWidth : y % 5 === 0 ? mediumWidth : minorWidth;
    ctx.beginPath();
    ctx.moveTo(0, (y - y0) * cellSize);
    ctx.lineTo((x1 - x0) * cellSize, (y - y0) * cellSize);
    ctx.stroke();
  }
}

/**
 * Draws only gridlines and symbols -- no cell fill -- so a photo drawn
 * underneath on the same canvas stays visible (G-012's "Grid + photo"
 * Image window mode, a reference view for checking symbol placement
 * against the real photo detail; not a download/export mode, so this
 * deliberately stays out of `RenderMode`/`renderPatternToCanvas`). Symbols
 * get a white halo (stroke before fill) since the photo underneath can be
 * any color, unlike `drawChart`'s luminance-based text color choice which
 * only has its own flat fill color to contrast against.
 */
export function drawChartOutline(ctx: CanvasRenderingContext2D, pattern: StitchPattern, cellSize: number, region?: ChartRegion) {
  const { width, height, cellPalette, palette } = pattern;
  const { x0, y0, x1, y1 } = region ?? { x0: 0, y0: 0, x1: width, y1: height };
  const drawSymbols = cellSize >= LEGIBILITY_FLOOR_PX;

  if (drawSymbols) {
    ctx.font = `${Math.round(cellSize * 0.6)}px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = Math.max(1, Math.round(cellSize * 0.12));
    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "#111111";

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const paletteIndex = cellPalette[y * width + x];
        if (paletteIndex === EMPTY_CELL) continue; // nothing to label -- no palette entry, no stitch
        const color = palette[paletteIndex];
        const localX = (x - x0) * cellSize + cellSize / 2;
        const localY = (y - y0) * cellSize + cellSize / 2 + 1;
        ctx.strokeText(color.symbol, localX, localY);
        ctx.fillText(color.symbol, localX, localY);
      }
    }
  }

  drawGridLines(ctx, x0, y0, x1, y1, cellSize);
}

// A dark "spotlight" mask over everything *not* highlighted reads more
// clearly at a glance than brightening the matches themselves would --
// works the same regardless of which colors/how many are underneath.
const HIGHLIGHT_MASK_ALPHA = 0.6;

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

/** Small inward-pointing triangles at the midpoint of each chart edge, marking the design's horizontal/vertical center — the conventional stitching start point on a real chart. */
function drawCenterMarkers(ctx: CanvasRenderingContext2D, chartWidthPx: number, chartHeightPx: number) {
  const size = MARKER_MARGIN * 0.6;
  const midX = chartWidthPx / 2;
  const midY = chartHeightPx / 2;
  ctx.fillStyle = GRID_LINE_COLOR;

  function triangle(points: Array<[number, number]>) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();
  }

  // Top, pointing down into the chart.
  triangle([
    [midX - size / 2, -MARKER_MARGIN],
    [midX + size / 2, -MARKER_MARGIN],
    [midX, -MARKER_MARGIN + size],
  ]);
  // Bottom, pointing up.
  triangle([
    [midX - size / 2, chartHeightPx + MARKER_MARGIN],
    [midX + size / 2, chartHeightPx + MARKER_MARGIN],
    [midX, chartHeightPx + MARKER_MARGIN - size],
  ]);
  // Left, pointing right.
  triangle([
    [-MARKER_MARGIN, midY - size / 2],
    [-MARKER_MARGIN, midY + size / 2],
    [-MARKER_MARGIN + size, midY],
  ]);
  // Right, pointing left.
  triangle([
    [chartWidthPx + MARKER_MARGIN, midY - size / 2],
    [chartWidthPx + MARKER_MARGIN, midY + size / 2],
    [chartWidthPx + MARKER_MARGIN - size, midY],
  ]);
}

/** Column numbers along the top, row numbers along the left, at every major (10-stitch) gridline — standard chart-software output for counting. */
function drawRowColumnNumbers(ctx: CanvasRenderingContext2D, width: number, height: number, cellSize: number) {
  if (cellSize < LEGIBILITY_FLOOR_PX) return;
  ctx.fillStyle = GRID_LINE_COLOR;
  ctx.font = `${Math.min(12, Math.round(cellSize * 0.45))}px ${FONT_STACK}`;

  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  for (let x = 10; x < width; x += 10) {
    ctx.fillText(String(x), x * cellSize, -MARKER_MARGIN - 4);
  }

  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let y = 10; y < height; y += 10) {
    ctx.fillText(String(y), -MARKER_MARGIN - 4, y * cellSize);
  }
}

const HEADER_FONT = `13px ${FONT_STACK}`;

/** Exported for unit testing -- the exported-PNG header text (also used to size its canvas), verified without needing a real canvas/DOM. */
export function headerText(pattern: StitchPattern, aidaCount: number, sizeUnit: SizeUnit, authorName?: string): string {
  const base = `${pattern.width} × ${pattern.height} stitches — approx. ${formatFinishedSize(pattern.width, pattern.height, aidaCount, sizeUnit)} on ${aidaCount}-count Aida`;
  return authorName?.trim() ? `${base} — Designed by ${authorName.trim()}` : base;
}

/** Design size in stitches and an estimated finished size at the selected Aida count — conventional on published charts (docs/domain-reference.md §1, §4). The canvas is always sized wide enough to fit this beforehand (see computeChartLayout) -- no wrapping/clipping needed here. */
function drawHeader(ctx: CanvasRenderingContext2D, pattern: StitchPattern, aidaCount: number, sizeUnit: SizeUnit, authorName?: string) {
  ctx.fillStyle = "#111111";
  ctx.font = HEADER_FONT;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(headerText(pattern, aidaCount, sizeUnit, authorName), LEGEND_PADDING, HEADER_HEIGHT / 2);
}

/** Shortens text with a trailing ellipsis if it doesn't fit maxWidth in the context's current font -- names from the reference list have no fixed length cap. */
export function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = `${text.slice(0, mid)}…`;
    if (ctx.measureText(candidate).width <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return low > 0 ? `${text.slice(0, low)}…` : "…";
}

function drawLegendItem(
  ctx: CanvasRenderingContext2D,
  color: PaletteColor,
  mode: RenderMode,
  x: number,
  y: number,
  aidaCount: number
) {
  // The legend swatch always shows the true color, even in B&W mode —
  // otherwise a B&W download carries no color information at all
  // (domain-expert review, HANDOVER.md D7).
  ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
  ctx.fillRect(x, y, LEGEND_SWATCH_SIZE, LEGEND_SWATCH_SIZE);
  ctx.strokeStyle = GRID_LINE_COLOR;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, LEGEND_SWATCH_SIZE, LEGEND_SWATCH_SIZE);

  ctx.fillStyle = luminance(color.rgb) > 140 ? "#000000" : "#ffffff";
  ctx.font = `${Math.round(LEGEND_SWATCH_SIZE * 0.6)}px ${FONT_STACK}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(color.symbol, x + LEGEND_SWATCH_SIZE / 2, y + LEGEND_SWATCH_SIZE / 2 + 1);

  const textX = x + LEGEND_SWATCH_SIZE + 8;
  const maxTextWidth = LEGEND_COLUMN_WIDTH - LEGEND_SWATCH_SIZE - 12;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#111111";
  ctx.font = `13px ${FONT_STACK}`;
  ctx.fillText(truncateToWidth(ctx, color.name, maxTextWidth), textX, y + LEGEND_SWATCH_SIZE / 2 + 1);

  ctx.fillStyle = "#666666";
  ctx.font = `11px ${FONT_STACK}`;
  const metaText = `${rgbToHex(color.rgb)} · ${color.count} sts · ${formatSkeinEstimate(color.count, aidaCount)}`;
  ctx.fillText(truncateToWidth(ctx, metaText, maxTextWidth), textX, y + LEGEND_SWATCH_SIZE + 10);

  void mode;
}

/** Lays the legend out below the chart (wide, few rows) when landscape, or to its right (tall, few columns) otherwise. */
function drawLegend(
  ctx: CanvasRenderingContext2D,
  pattern: StitchPattern,
  mode: RenderMode,
  chartWidthPx: number,
  chartHeightPx: number,
  belowChart: boolean,
  aidaCount: number
) {
  const { palette } = pattern;

  if (belowChart) {
    const columns = Math.max(1, Math.floor(chartWidthPx / LEGEND_COLUMN_WIDTH));
    palette.forEach((color, i) => {
      const col = i % columns;
      const row = Math.floor(i / columns);
      drawLegendItem(
        ctx,
        color,
        mode,
        LEGEND_PADDING + col * LEGEND_COLUMN_WIDTH,
        chartHeightPx + MARKER_MARGIN + LEGEND_PADDING + row * LEGEND_ITEM_HEIGHT,
        aidaCount
      );
    });
  } else {
    const rowsPerColumn = Math.max(1, Math.floor(chartHeightPx / LEGEND_ITEM_HEIGHT));
    palette.forEach((color, i) => {
      const col = Math.floor(i / rowsPerColumn);
      const row = i % rowsPerColumn;
      drawLegendItem(
        ctx,
        color,
        mode,
        chartWidthPx + MARKER_MARGIN + LEGEND_PADDING + col * LEGEND_COLUMN_WIDTH,
        row * LEGEND_ITEM_HEIGHT,
        aidaCount
      );
    });
  }
}

export function legendCanvasExtent(pattern: StitchPattern, chartWidthPx: number, chartHeightPx: number) {
  const belowChart = pattern.isLandscape;
  const count = pattern.palette.length;
  if (belowChart) {
    const columns = Math.max(1, Math.floor(chartWidthPx / LEGEND_COLUMN_WIDTH));
    const rows = Math.ceil(count / columns);
    return { extraWidth: 0, extraHeight: MARKER_MARGIN + LEGEND_PADDING + rows * LEGEND_ITEM_HEIGHT, belowChart };
  }
  const rowsPerColumn = Math.max(1, Math.floor(chartHeightPx / LEGEND_ITEM_HEIGHT));
  const columns = Math.ceil(count / rowsPerColumn);
  return { extraWidth: MARKER_MARGIN + LEGEND_PADDING + columns * LEGEND_COLUMN_WIDTH, extraHeight: 0, belowChart };
}

/**
 * Draws just the grid (fills, symbols, gridlines) with no legend, header,
 * markers, or numbers, at exactly `width*cellSize x height*cellSize` -- for
 * the interactive pattern editor, where the legend is a separate, real DOM
 * list (so native drag-and-drop works) and click-to-cell hit-testing needs
 * to be plain `floor(pixel / cellSize)` arithmetic with no gutters to
 * account for.
 */
export function renderEditableCanvas(pattern: StitchPattern, cellSize: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = pattern.width * cellSize;
  canvas.height = pattern.height * cellSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  drawChart(ctx, pattern, "color", cellSize);
  return canvas;
}

export interface ChartLayout {
  cellSize: number;
  chartWidthPx: number;
  chartHeightPx: number;
  belowChart: boolean;
  leftGutter: number;
  topGutter: number;
  canvasWidth: number;
  canvasHeight: number;
}

/**
 * Finds the largest cell size (down to `MIN_CHART_CELL_SIZE_PX`) at which the
 * *complete* chart -- grid, header, legend, margins, and marker/number
 * gutters together -- fits within `MAX_CHART_DIMENSION_PX`/`MAX_CHART_AREA_PX`.
 * `headerWidthPx` is measured by the caller (needs a canvas context); this
 * function itself has no DOM dependency, so the actual safety-critical
 * arithmetic is directly unit-testable rather than only reachable through a
 * browser (unlike the rest of this file). Returns `null` if no cell size fits.
 */
export function findChartLayout(pattern: StitchPattern, requestedCellSize: number, headerWidthPx: number): ChartLayout | null {
  // Clamped up to the floor even when the caller asked for something smaller
  // (e.g. a live on-screen preview's own small thumbnail sizing) -- a
  // request below the floor should fall back to the floor, matching the old
  // effectiveCellSize's own Math.max(4, ...) clamp, not be treated as an
  // empty search range that immediately fails.
  const startingCellSize = Math.max(
    MIN_CHART_CELL_SIZE_PX,
    Math.min(requestedCellSize, Math.floor(MAX_CHART_DIMENSION_PX / Math.max(pattern.width, pattern.height)))
  );

  for (let cellSize = startingCellSize; cellSize >= MIN_CHART_CELL_SIZE_PX; cellSize--) {
    const chartWidthPx = pattern.width * cellSize;
    const chartHeightPx = pattern.height * cellSize;
    const { extraWidth, extraHeight, belowChart } = legendCanvasExtent(pattern, chartWidthPx, chartHeightPx);

    // Left/top gutters hold the centre-marker arrow plus row/column numbers;
    // right/bottom gutters hold just the arrow (numbers only run along the
    // top and left, per the same convention real chart software uses).
    // Whichever side the legend attaches to already reserves a MARKER_MARGIN
    // gap before it starts (see legendCanvasExtent) -- that gap doubles as
    // the arrow marker's space on that side, so only the *other* side needs
    // its own gutter added here, or the canvas ends up with duplicated,
    // wasted margin.
    const leftGutter = MARKER_MARGIN + NUMBER_MARGIN;
    const topGutter = MARKER_MARGIN + NUMBER_MARGIN;
    const rightGutter = belowChart ? MARKER_MARGIN : 0;
    const bottomGutter = belowChart ? 0 : MARKER_MARGIN;

    // Widening for the header text here is finding 5's fix -- drawHeader
    // used to receive but discard the canvas width it would have needed to
    // avoid clipping a short/small chart's header.
    const canvasWidth = Math.max(leftGutter + chartWidthPx + rightGutter + extraWidth, headerWidthPx);
    const canvasHeight = HEADER_HEIGHT + topGutter + chartHeightPx + bottomGutter + extraHeight;

    if (canvasWidth <= MAX_CHART_DIMENSION_PX && canvasHeight <= MAX_CHART_DIMENSION_PX && canvasWidth * canvasHeight <= MAX_CHART_AREA_PX) {
      return { cellSize, chartWidthPx, chartHeightPx, belowChart, leftGutter, topGutter, canvasWidth, canvasHeight };
    }
  }

  return null;
}

function computeChartLayout(pattern: StitchPattern, requestedCellSize: number, aidaCount: number, sizeUnit: SizeUnit, authorName?: string): ChartLayout {
  const measureCtx = document.createElement("canvas").getContext("2d");
  if (!measureCtx) throw new Error("2D canvas context unavailable");
  measureCtx.font = HEADER_FONT;
  const headerWidthPx = measureCtx.measureText(headerText(pattern, aidaCount, sizeUnit, authorName)).width + LEGEND_PADDING * 2;

  const layout = findChartLayout(pattern, requestedCellSize, headerWidthPx);
  if (!layout) throw new ChartTooLargeError();
  return layout;
}

export function renderPatternToCanvas(
  pattern: StitchPattern,
  mode: RenderMode,
  options: RenderOptions = {}
): HTMLCanvasElement {
  const aidaCount = options.aidaCount ?? DEFAULT_AIDA_COUNT;
  const sizeUnit = options.sizeUnit ?? DEFAULT_SIZE_UNIT;
  const authorName = options.authorName;
  const layout = computeChartLayout(pattern, options.cellSize ?? DEFAULT_CELL_SIZE, aidaCount, sizeUnit, authorName);
  const { cellSize, chartWidthPx, chartHeightPx, belowChart, leftGutter, topGutter, canvasWidth, canvasHeight } = layout;

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawHeader(ctx, pattern, aidaCount, sizeUnit, authorName);

  ctx.save();
  ctx.translate(leftGutter, HEADER_HEIGHT + topGutter);
  drawChart(ctx, pattern, mode, cellSize);
  drawLegend(ctx, pattern, mode, chartWidthPx, chartHeightPx, belowChart, aidaCount);
  drawCenterMarkers(ctx, chartWidthPx, chartHeightPx);
  drawRowColumnNumbers(ctx, pattern.width, pattern.height, cellSize);
  ctx.restore();

  return canvas;
}

// Simulated-canvas preview constants -- deliberately minimal (flat gray
// background + a tinted photo-texture stitch + a plain border): this is a
// "what will this look like stitched" preview, not another printable chart
// variant, so it carries none of drawChart's grid/symbol/legend/marker
// machinery.
const PREVIEW_CANVAS_COLOR = "#808080"; // 50% gray, per Owner request
const PREVIEW_BORDER = 16;

/**
 * Renders the pattern as a simulated finished piece: each cell drawn as the
 * shared stitch-texture image (see `stitch-texture.ts`) tinted to that
 * cell's palette color -- preserving the texture's own shading and soft
 * alpha edges -- on a flat 50%-gray background, with a small white border.
 * No grid lines, symbols, legend, markers, or numbers -- this is a
 * look-and-feel preview, not a stitchable chart.
 */
export async function renderStitchPreviewToCanvas(
  pattern: StitchPattern,
  options: RenderOptions = {}
): Promise<HTMLCanvasElement> {
  const { width, height, cellPalette, palette } = pattern;
  const cellSize = effectiveCellSize(width, height, options.cellSize ?? DEFAULT_CELL_SIZE);
  const areaWidthPx = width * cellSize;
  const areaHeightPx = height * cellSize;

  const canvas = document.createElement("canvas");
  canvas.width = areaWidthPx + PREVIEW_BORDER * 2;
  canvas.height = areaHeightPx + PREVIEW_BORDER * 2;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(PREVIEW_BORDER, PREVIEW_BORDER);

  ctx.fillStyle = PREVIEW_CANVAS_COLOR;
  ctx.fillRect(0, 0, areaWidthPx, areaHeightPx);

  const textures = await buildTintedTextureSet(palette);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const paletteIndex = cellPalette[y * width + x];
      // The empty-stitch sentinel has no texture to tint -- leave the plain
      // canvas-color fill already painted above showing through (G-012 M5).
      if (paletteIndex === EMPTY_CELL) continue;
      const tinted = textures.get(paletteIndex);
      ctx.drawImage(tinted, x * cellSize, y * cellSize, cellSize, cellSize);
    }
  }

  ctx.restore();
  return canvas;
}

/**
 * Returns a promise that resolves only after encoding actually succeeds and
 * the download has been initiated, and rejects on a `null` blob -- a real,
 * documented `toBlob` failure case (MDN). The previous fire-and-forget
 * version returned immediately regardless of outcome, so a caller's
 * "Preparing..." state cleared before encoding even finished, and a `null`
 * blob silently produced no file and no error (code-review 2026-09-09,
 * finding 7).
 */
export function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Couldn't encode the image for download. Try a smaller pattern size."));
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
      resolve();
    }, "image/png");
  });
}
