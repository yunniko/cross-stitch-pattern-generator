import { luminance } from "./color";
import type { PaletteColor, StitchPattern, RGB } from "./types";

export type RenderMode = "color" | "bw";

export interface RenderOptions {
  /** Preferred pixel size of one stitch cell before the max-canvas-size clamp applies. */
  cellSize?: number;
}

const DEFAULT_CELL_SIZE = 24;
// Chrome/Firefox both choke well before this on canvas area; clamping keeps a
// 1000-stitch pattern (the spec's own upper bound) from ever producing a
// canvas the browser can't allocate. Not verified on every browser engine —
// see HANDOVER.md D7's cross-browser caveat.
const MAX_CANVAS_DIMENSION = 12000;
// Below this, grid lines/symbols are illegible noise rather than helpful
// detail — line weights collapse to 1px and symbols stop being drawn
// (domain-expert review, HANDOVER.md D7).
const LEGIBILITY_FLOOR_PX = 6;

// A pinned system font stack instead of bare "sans-serif" — the domain-expert
// review flagged a real (if unverified in this session) emoji-fallback risk
// for some of the curated dingbat symbols (e.g. a heart or star could render
// as a colored emoji glyph on some platforms' fallback fonts instead of the
// plain glyph every other symbol uses). Arial/Segoe UI are both installed by
// default on the large majority of desktop platforms this runs on and don't
// substitute emoji presentations for these code points. See HANDOVER.md D12.
const FONT_STACK = "Arial, 'Segoe UI', sans-serif";

const GRID_LINE_COLOR = "#333333";
// Line weights scale with cell size (a constant 1/2/3px reads as noise once
// cells shrink toward the max-stitch-count end of the range) — ratios
// chosen so the previous fixed 1/2/3px come out unchanged at the default
// 24px cell size (HANDOVER.md D7).
const MINOR_LINE_RATIO = 1 / 24;
const MEDIUM_LINE_RATIO = 2 / 24;
const MAJOR_LINE_RATIO = 3 / 24;

const LEGEND_ITEM_HEIGHT = 28;
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
// Finished-size estimate uses 14-count Aida — the most common count for a
// general-purpose chart (docs/domain-reference.md §4); labeled as an
// estimate, not a claim about the fabric the Owner will actually use.
const AIDA_COUNT_FOR_ESTIMATE = 14;

function effectiveCellSize(width: number, height: number, requested: number): number {
  const longerSide = Math.max(width, height);
  const maxByCanvas = Math.floor(MAX_CANVAS_DIMENSION / longerSide);
  return Math.max(4, Math.min(requested, maxByCanvas));
}

function rgbToHex([r, g, b]: RGB): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
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

function drawChart(ctx: CanvasRenderingContext2D, pattern: StitchPattern, mode: RenderMode, cellSize: number) {
  const { width, height, cellPalette, palette } = pattern;
  const drawSymbols = cellSize >= LEGIBILITY_FLOOR_PX;

  if (drawSymbols) {
    ctx.font = `${Math.round(cellSize * 0.6)}px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = palette[cellPalette[y * width + x]];
      ctx.fillStyle = fillForCell(mode, color.rgb);
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);

      if (drawSymbols) {
        ctx.fillStyle = symbolTextColor(mode, color.rgb);
        ctx.fillText(color.symbol, x * cellSize + cellSize / 2, y * cellSize + cellSize / 2 + 1);
      }
    }
  }

  const minorWidth = Math.max(1, Math.round(cellSize * MINOR_LINE_RATIO));
  const mediumWidth = Math.max(1, Math.round(cellSize * MEDIUM_LINE_RATIO));
  const majorWidth = Math.max(1, Math.round(cellSize * MAJOR_LINE_RATIO));

  ctx.strokeStyle = GRID_LINE_COLOR;
  for (let x = 0; x <= width; x++) {
    ctx.lineWidth = x % 10 === 0 ? majorWidth : x % 5 === 0 ? mediumWidth : minorWidth;
    ctx.beginPath();
    ctx.moveTo(x * cellSize, 0);
    ctx.lineTo(x * cellSize, height * cellSize);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y++) {
    ctx.lineWidth = y % 10 === 0 ? majorWidth : y % 5 === 0 ? mediumWidth : minorWidth;
    ctx.beginPath();
    ctx.moveTo(0, y * cellSize);
    ctx.lineTo(width * cellSize, y * cellSize);
    ctx.stroke();
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

/** Design size in stitches and an estimated finished size at a common Aida count — conventional on published charts (docs/domain-reference.md §1, §4). */
function drawHeader(ctx: CanvasRenderingContext2D, pattern: StitchPattern, canvasWidth: number) {
  const inWidth = pattern.width / AIDA_COUNT_FOR_ESTIMATE;
  const inHeight = pattern.height / AIDA_COUNT_FOR_ESTIMATE;
  const text = `${pattern.width} × ${pattern.height} stitches — approx. ${inWidth.toFixed(1)} × ${inHeight.toFixed(1)} in on ${AIDA_COUNT_FOR_ESTIMATE}-count Aida`;

  ctx.fillStyle = "#111111";
  ctx.font = `13px ${FONT_STACK}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(text, LEGEND_PADDING, HEADER_HEIGHT / 2);
  void canvasWidth;
}

function drawLegendItem(
  ctx: CanvasRenderingContext2D,
  color: PaletteColor,
  mode: RenderMode,
  x: number,
  y: number
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

  ctx.fillStyle = "#111111";
  ctx.font = `13px ${FONT_STACK}`;
  ctx.textAlign = "left";
  ctx.fillText(`${rgbToHex(color.rgb)} · ${color.count} sts`, x + LEGEND_SWATCH_SIZE + 8, y + LEGEND_SWATCH_SIZE / 2 + 1);

  void mode;
}

/** Lays the legend out below the chart (wide, few rows) when landscape, or to its right (tall, few columns) otherwise. */
function drawLegend(
  ctx: CanvasRenderingContext2D,
  pattern: StitchPattern,
  mode: RenderMode,
  chartWidthPx: number,
  chartHeightPx: number,
  belowChart: boolean
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
        chartHeightPx + MARKER_MARGIN + LEGEND_PADDING + row * LEGEND_ITEM_HEIGHT
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
        row * LEGEND_ITEM_HEIGHT
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

export function renderPatternToCanvas(
  pattern: StitchPattern,
  mode: RenderMode,
  options: RenderOptions = {}
): HTMLCanvasElement {
  const cellSize = effectiveCellSize(pattern.width, pattern.height, options.cellSize ?? DEFAULT_CELL_SIZE);
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

  const canvas = document.createElement("canvas");
  canvas.width = leftGutter + chartWidthPx + rightGutter + extraWidth;
  canvas.height = HEADER_HEIGHT + topGutter + chartHeightPx + bottomGutter + extraHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawHeader(ctx, pattern, canvas.width);

  ctx.save();
  ctx.translate(leftGutter, HEADER_HEIGHT + topGutter);
  drawChart(ctx, pattern, mode, cellSize);
  drawLegend(ctx, pattern, mode, chartWidthPx, chartHeightPx, belowChart);
  drawCenterMarkers(ctx, chartWidthPx, chartHeightPx);
  drawRowColumnNumbers(ctx, pattern.width, pattern.height, cellSize);
  ctx.restore();

  return canvas;
}

// Simulated-canvas preview constants -- deliberately minimal (flat fabric
// tone + colored stitches + a plain border, no weave texture/shading): this
// is a "what will this look like stitched" preview, not another printable
// chart variant, so it carries none of drawChart's grid/symbol/legend/marker
// machinery.
const FABRIC_COLOR = "#f0e9d8";
const STITCH_WIDTH_RATIO = 0.16;
const PREVIEW_BORDER = 16;

/**
 * Renders the pattern as a simple simulated finished piece: each cell drawn
 * as a colored "X" cross-stitch on a flat fabric-toned background, with a
 * small white border. No grid lines, symbols, legend, markers, or numbers --
 * this is a look-and-feel preview, not a stitchable chart.
 */
export function renderStitchPreviewToCanvas(
  pattern: StitchPattern,
  options: RenderOptions = {}
): HTMLCanvasElement {
  const { width, height, cellPalette, palette } = pattern;
  const cellSize = effectiveCellSize(width, height, options.cellSize ?? DEFAULT_CELL_SIZE);
  const fabricWidthPx = width * cellSize;
  const fabricHeightPx = height * cellSize;

  const canvas = document.createElement("canvas");
  canvas.width = fabricWidthPx + PREVIEW_BORDER * 2;
  canvas.height = fabricHeightPx + PREVIEW_BORDER * 2;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.translate(PREVIEW_BORDER, PREVIEW_BORDER);

  ctx.fillStyle = FABRIC_COLOR;
  ctx.fillRect(0, 0, fabricWidthPx, fabricHeightPx);

  const strokeWidth = Math.max(1, cellSize * STITCH_WIDTH_RATIO);
  // No inset: each "X" reaches its cell's corners exactly, so adjacent
  // cells' stitches meet corner-to-corner with no gap between them --
  // matches how adjoining full cross-stitches actually share fabric holes.
  const inset = 0;
  ctx.lineCap = "round";
  ctx.lineWidth = strokeWidth;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = palette[cellPalette[y * width + x]];
      ctx.strokeStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
      const left = x * cellSize + inset;
      const right = (x + 1) * cellSize - inset;
      const top = y * cellSize + inset;
      const bottom = (y + 1) * cellSize - inset;

      ctx.beginPath();
      ctx.moveTo(left, top);
      ctx.lineTo(right, bottom);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(right, top);
      ctx.lineTo(left, bottom);
      ctx.stroke();
    }
  }

  ctx.restore();
  return canvas;
}

export function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}
