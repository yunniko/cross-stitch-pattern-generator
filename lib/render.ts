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
// canvas the browser can't allocate.
const MAX_CANVAS_DIMENSION = 12000;

const GRID_LINE_COLOR = "#333333";
const MINOR_LINE_WIDTH = 1;
const MEDIUM_LINE_WIDTH = 2;
const MAJOR_LINE_WIDTH = 3;

const LEGEND_ITEM_HEIGHT = 28;
const LEGEND_SWATCH_SIZE = 20;
const LEGEND_PADDING = 16;
const LEGEND_COLUMN_WIDTH = 150;

function effectiveCellSize(width: number, height: number, requested: number): number {
  const longerSide = Math.max(width, height);
  const maxByCanvas = Math.floor(MAX_CANVAS_DIMENSION / longerSide);
  return Math.max(4, Math.min(requested, maxByCanvas));
}

function fillForCell(mode: RenderMode, rgb: RGB): string {
  if (mode === "color") return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  const gray = luminance(rgb);
  return `rgb(${gray}, ${gray}, ${gray})`;
}

function contrastingTextColor(mode: RenderMode, rgb: RGB): string {
  const gray = mode === "color" ? luminance(rgb) : luminance(rgb);
  return gray > 140 ? "#000000" : "#ffffff";
}

function drawChart(ctx: CanvasRenderingContext2D, pattern: StitchPattern, mode: RenderMode, cellSize: number) {
  const { width, height, cellPalette, palette } = pattern;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = palette[cellPalette[y * width + x]];
      ctx.fillStyle = fillForCell(mode, color.rgb);
      ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);

      ctx.fillStyle = contrastingTextColor(mode, color.rgb);
      ctx.font = `${Math.round(cellSize * 0.6)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(color.symbol, x * cellSize + cellSize / 2, y * cellSize + cellSize / 2 + 1);
    }
  }

  ctx.strokeStyle = GRID_LINE_COLOR;
  for (let x = 0; x <= width; x++) {
    ctx.lineWidth = x % 10 === 0 ? MAJOR_LINE_WIDTH : x % 5 === 0 ? MEDIUM_LINE_WIDTH : MINOR_LINE_WIDTH;
    ctx.beginPath();
    ctx.moveTo(x * cellSize, 0);
    ctx.lineTo(x * cellSize, height * cellSize);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y++) {
    ctx.lineWidth = y % 10 === 0 ? MAJOR_LINE_WIDTH : y % 5 === 0 ? MEDIUM_LINE_WIDTH : MINOR_LINE_WIDTH;
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
  ctx.fillStyle = fillForCell(mode, color.rgb);
  ctx.fillRect(x, y, LEGEND_SWATCH_SIZE, LEGEND_SWATCH_SIZE);
  ctx.strokeStyle = GRID_LINE_COLOR;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, LEGEND_SWATCH_SIZE, LEGEND_SWATCH_SIZE);

  ctx.fillStyle = contrastingTextColor(mode, color.rgb);
  ctx.font = `${Math.round(LEGEND_SWATCH_SIZE * 0.6)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(color.symbol, x + LEGEND_SWATCH_SIZE / 2, y + LEGEND_SWATCH_SIZE / 2 + 1);

  ctx.fillStyle = "#111111";
  ctx.font = "13px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`× ${color.count}`, x + LEGEND_SWATCH_SIZE + 8, y + LEGEND_SWATCH_SIZE / 2 + 1);
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
  const { palette, isLandscape } = pattern;
  void isLandscape;

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
