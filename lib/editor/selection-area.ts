import { clipLines, lineKey, lineWithinRect, shiftLines } from "./backstitch";
import { liftSelection } from "./floating-selection";
import type { BackstitchLine, CellRect, FloatingSelection, StitchPattern } from "../types";

/**
 * What is selected, as an area of the chart (G-116, D330): a chart-sized cell mask (1 for in) and a set of the chart's
 * backstitch lines, both in chart coordinates. Select, Lasso and the Magic wand each make one; `combineAreas` joins them by
 * the selection mode, and `liftArea` turns the result into the piece in hand.
 */
export interface SelectionArea {
  readonly cells: Uint8Array;
  readonly lines: readonly BackstitchLine[];
}

/** How a new area meets the selection already made: it replaces it, is added to it, or is taken out of it. */
export type SelectionMode = "replace" | "add" | "subtract";

export const SELECTION_MODES: readonly SelectionMode[] = ["replace", "add", "subtract"];

/** Nothing selected. */
export function emptyArea(pattern: StitchPattern): SelectionArea {
  return { cells: new Uint8Array(pattern.cellPalette.length), lines: [] };
}

export function isEmptyArea(area: SelectionArea): boolean {
  return area.lines.length === 0 && !area.cells.some((v) => v !== 0);
}

/**
 * The cells a chart-sized mask marks, with the chart's lines whose both ends touch them: the rule a lifted piece has
 * always used (`lineWithinRect`), applied to the whole chart.
 */
export function areaFromCells(pattern: StitchPattern, cells: Uint8Array): SelectionArea {
  assertChartSized(pattern, cells);
  const chart: CellRect = { x: 0, y: 0, width: pattern.width, height: pattern.height };
  return { cells, lines: (pattern.backstitch ?? []).filter((line) => lineWithinRect(line, chart, cells)) };
}

/**
 * A dragged box, or a lassoed shape inside it (`mask`, in the box's own coordinates), as an area. The box may run off the
 * chart; only its part on the chart is selected.
 */
export function areaFromBox(pattern: StitchPattern, rect: CellRect, mask?: Uint8Array): SelectionArea {
  const { width, height } = pattern;
  const cells = new Uint8Array(width * height);
  for (let ly = 0; ly < rect.height; ly++) {
    const y = rect.y + ly;
    if (y < 0 || y >= height) continue;
    for (let lx = 0; lx < rect.width; lx++) {
      const x = rect.x + lx;
      if (x < 0 || x >= width || (mask && !mask[ly * rect.width + lx])) continue;
      cells[y * width + x] = 1;
    }
  }
  return areaFromCells(pattern, cells);
}

/** Every backstitch line of one colour, and no cells (G-116: a wand click on a line). */
export function linesOfColour(pattern: StitchPattern, paletteIndex: number): SelectionArea {
  return {
    cells: new Uint8Array(pattern.cellPalette.length),
    lines: (pattern.backstitch ?? []).filter((line) => line.paletteIndex === paletteIndex),
  };
}

/**
 * Where a piece in hand sits on the chart now: its shape (or whole box) and the lines it carries, cut to the chart. Under
 * decision (a) the piece is put down before it is combined, so these are the chart's own cells and lines.
 */
export function pieceArea(pattern: StitchPattern, piece: FloatingSelection): SelectionArea {
  const box: CellRect = { x: piece.x, y: piece.y, width: piece.width, height: piece.height };
  const { cells } = areaFromBox(pattern, box, piece.mask);
  const lines = piece.backstitch ? clipLines(shiftLines(piece.backstitch, piece.x, piece.y), pattern.width, pattern.height) : [];
  return { cells, lines };
}

/**
 * One area joined with the next by `mode`: cells by mask, lines as a set (a line is the same stitch whichever end it was
 * drawn from, `lineKey`).
 */
export function combineAreas(current: SelectionArea, next: SelectionArea, mode: SelectionMode): SelectionArea {
  if (current.cells.length !== next.cells.length) {
    throw new Error(`Cannot combine areas of ${current.cells.length} and ${next.cells.length} cells.`);
  }
  if (mode === "replace") return next;
  const cells = new Uint8Array(current.cells.length);
  const nextKeys = new Set(next.lines.map(lineKey));
  if (mode === "add") {
    for (let i = 0; i < cells.length; i++) cells[i] = current.cells[i] || next.cells[i] ? 1 : 0;
    const have = new Set(current.lines.map(lineKey));
    return { cells, lines: [...current.lines, ...next.lines.filter((line) => !have.has(lineKey(line)))] };
  }
  for (let i = 0; i < cells.length; i++) cells[i] = current.cells[i] && !next.cells[i] ? 1 : 0;
  return { cells, lines: current.lines.filter((line) => !nextKeys.has(lineKey(line))) };
}

/** Everything the area leaves out: the other cells of the chart and the chart's other lines. */
export function invertArea(pattern: StitchPattern, area: SelectionArea): SelectionArea {
  assertChartSized(pattern, area.cells);
  const cells = new Uint8Array(area.cells.length);
  for (let i = 0; i < cells.length; i++) cells[i] = area.cells[i] ? 0 : 1;
  const taken = new Set(area.lines.map(lineKey));
  return { cells, lines: (pattern.backstitch ?? []).filter((line) => !taken.has(lineKey(line))) };
}

/**
 * Lifts an area as the piece in hand: its box covers the selected cells and every end of its lines, and it takes exactly
 * the area's lines. A box the area fills completely has no mask, as a plain rectangle never had. Null for an empty area.
 */
export function liftArea(pattern: StitchPattern, area: SelectionArea): FloatingSelection | null {
  assertChartSized(pattern, area.cells);
  const { width, height } = pattern;
  // The box in corner coordinates: a cell (x, y) spans corners x..x+1, a line its two ends.
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let i = 0; i < area.cells.length; i++) {
    if (!area.cells[i]) continue;
    const x = i % width;
    const y = (i - x) / width;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x + 1);
    y1 = Math.max(y1, y + 1);
  }
  for (const line of area.lines) {
    x0 = Math.min(x0, line.x1, line.x2);
    y0 = Math.min(y0, line.y1, line.y2);
    x1 = Math.max(x1, line.x1, line.x2);
    y1 = Math.max(y1, line.y1, line.y2);
  }
  if (x0 === Infinity) return null;
  // A straight line has no width (or height) of its own; the piece needs one cell of it.
  if (x1 === x0) [x0, x1] = x1 < width ? [x0, x0 + 1] : [x0 - 1, x0];
  if (y1 === y0) [y0, y1] = y1 < height ? [y0, y0 + 1] : [y0 - 1, y0];
  const rect: CellRect = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  const mask = new Uint8Array(rect.width * rect.height);
  let full = true;
  for (let ly = 0; ly < rect.height; ly++) {
    for (let lx = 0; lx < rect.width; lx++) {
      const v = area.cells[(rect.y + ly) * width + rect.x + lx];
      mask[ly * rect.width + lx] = v;
      if (!v) full = false;
    }
  }
  return liftSelection(pattern, rect, full ? undefined : mask, area.lines);
}

function assertChartSized(pattern: StitchPattern, cells: Uint8Array): void {
  if (cells.length !== pattern.width * pattern.height) {
    throw new Error(`An area of ${cells.length} cells does not fit a ${pattern.width} × ${pattern.height} chart.`);
  }
}
