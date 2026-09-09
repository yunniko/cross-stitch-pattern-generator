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
    ctx.font = `${Math.round(cellSize * 0.6)}px sans-serif`;
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
  ctx.font = `${Math.round(LEGEND_SWATCH_SIZE * 0.6)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(color.symbol, x + LEGEND_SWATCH_SIZE / 2, y + LEGEND_SWATCH_SIZE / 2 + 1);

  ctx.fillStyle = "#111111";
  ctx.font = "13px sans-serif";
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
        chartHeightPx + LEGEND_PADDING + row * LEGEND_ITEM_HEIGHT
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
        chartWidthPx + LEGEND_PADDING + col * LEGEND_COLUMN_WIDTH,
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
    return { extraWidth: 0, extraHeight: LEGEND_PADDING + rows * LEGEND_ITEM_HEIGHT, belowChart };
  }
  const rowsPerColumn = Math.max(1, Math.floor(chartHeightPx / LEGEND_ITEM_HEIGHT));
  const columns = Math.ceil(count / rowsPerColumn);
  return { extraWidth: LEGEND_PADDING + columns * LEGEND_COLUMN_WIDTH, extraHeight: 0, belowChart };
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

  const canvas = document.createElement("canvas");
  canvas.width = chartWidthPx + extraWidth;
  canvas.height = chartHeightPx + extraHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawChart(ctx, pattern, mode, cellSize);
  drawLegend(ctx, pattern, mode, chartWidthPx, chartHeightPx, belowChart);

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
