import type { ChartDrawingContext } from "./chart-drawing-context";
import { luminance, rgbToHex } from "./color";
import type { A4Layout, PageRange } from "./a4-layout";
import { mmToPx, PRINT_DPI } from "./a4-layout";
import { formatFinishedSize, type SizeUnit } from "./finished-size";
import { estimateSkeins } from "./floss-estimate";
import { drawChart, FONT_STACK, GRID_LINE_COLOR, LEGIBILITY_FLOOR_PX, truncateToWidth, type RenderMode } from "./render";
import { THREAD_BRANDS } from "./thread-brands";
import type { PaletteColor, StitchPattern } from "./types";

// Physical text sizes for print, independent of cell size (unlike the
// on-screen single-PNG chart, where number/label font sizes scale with
// cell size) -- these need to stay legibly readable on paper regardless of
// how small the cells themselves are at this print resolution.
const CAPTION_FONT_MM = 4.5;
const NUMBER_FONT_MM = 3.2;
const OVERLAP_LABEL_FONT_MM = 3;

// Tint applied over cells that also appear on an adjacent page, so the user
// doesn't double-count them when assembling printed pages (Owner's spec,
// requirement 6). Semi-transparent so the underlying stitch color/symbol
// stays visible underneath.
const OVERLAP_TINT = "rgba(255, 200, 0, 0.35)";

export interface OverlapSides {
  left: boolean;
  top: boolean;
  right: boolean;
  bottom: boolean;
}

/** Which sides of `page` are shared with an adjacent page, given its position in the overall grid. */
export function overlapSidesForPage(page: PageRange, layout: A4Layout): OverlapSides {
  const hasOverlap = layout.overlapCells > 0;
  return {
    left: hasOverlap && page.column > 0,
    top: hasOverlap && page.row > 0,
    right: hasOverlap && page.column < layout.columns - 1,
    bottom: hasOverlap && page.row < layout.rows - 1,
  };
}

/**
 * Just the tint -- no "OVERLAP" text on the band itself (Owner decision,
 * 2026-09-12: the word was cluttering the grid on every render mode: PNG
 * color/B&W and the PDF export, since both now share this function).
 * What the tint means is explained once, in the legend
 * (`drawA4LegendPage`'s overlap note below), not repeated on every band
 * of every page.
 */
function drawOverlapBands(
  ctx: ChartDrawingContext,
  page: PageRange,
  layout: A4Layout,
  sides: OverlapSides,
  gridWidthPx: number,
  gridHeightPx: number
) {
  const bandPx = layout.overlapCells * layout.cellSizePx;
  if (bandPx <= 0) return;

  ctx.fillStyle = OVERLAP_TINT;
  if (sides.left) ctx.fillRect(0, 0, bandPx, gridHeightPx);
  if (sides.right) ctx.fillRect(gridWidthPx - bandPx, 0, bandPx, gridHeightPx);
  if (sides.top) ctx.fillRect(0, 0, gridWidthPx, bandPx);
  if (sides.bottom) ctx.fillRect(0, gridHeightPx - bandPx, gridWidthPx, bandPx);
}

/** Column numbers along the page's own top edge, row numbers along its own left edge -- always the pattern's *global* coordinates, labeled every 10 stitches, so a page starting at stitch 70 still reads "70, 80, 90...", not "0, 10, 20...". */
function drawGlobalCoordinateNumbers(ctx: ChartDrawingContext, page: PageRange, layout: A4Layout) {
  if (layout.cellSizePx < LEGIBILITY_FLOOR_PX) return;

  const fontPx = mmToPx(NUMBER_FONT_MM, layout.dpi);
  ctx.fillStyle = GRID_LINE_COLOR;
  ctx.font = `${fontPx}px ${FONT_STACK}`;

  const firstColumnLabel = Math.ceil(page.startX / 10) * 10;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  for (let x = firstColumnLabel; x < page.endX; x += 10) {
    if (x === 0) continue;
    const localX = (x - page.startX) * layout.cellSizePx;
    ctx.fillText(String(x), localX, -4);
  }

  const firstRowLabel = Math.ceil(page.startY / 10) * 10;
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let y = firstRowLabel; y < page.endY; y += 10) {
    if (y === 0) continue;
    const localY = (y - page.startY) * layout.cellSizePx;
    ctx.fillText(String(y), -4, localY);
  }
}

function drawPageCaption(ctx: ChartDrawingContext, page: PageRange, pageIndex: number, totalPages: number, layout: A4Layout) {
  const fontPx = mmToPx(CAPTION_FONT_MM, layout.dpi);
  ctx.fillStyle = "#111111";
  ctx.font = `${fontPx}px ${FONT_STACK}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const text = `Page ${pageIndex + 1} / ${totalPages}  —  Row ${page.row + 1}, Column ${page.column + 1}`;
  ctx.fillText(text, layout.gridOriginXPx, layout.marginPx);
}

/**
 * Renders one A4 grid page: the pattern's fragment for `page`'s stitch
 * range, plus this page's global coordinate numbers, overlap-band
 * highlighting, and a "Page X/N, Row R, Column C" caption -- at the full
 * physical print resolution described by `layout`. Reuses `drawChart` for
 * every cell/symbol/color pixel (Owner's spec, requirement 15); everything
 * else here is page-specific chrome that `drawChart` has no notion of.
 */
/**
 * The actual drawing logic for one A4 grid page, factored out from
 * `renderA4GridPage` (which just allocates a canvas around this) so G-026
 * M2's PDF exporter can call it unmodified against a `PdfCanvasAdapter`
 * instead -- one implementation of this page's content, never two that
 * could drift apart (HANDOVER.md D11/D74).
 */
export function drawA4GridPage(
  ctx: ChartDrawingContext,
  pattern: StitchPattern,
  mode: RenderMode,
  layout: A4Layout,
  page: PageRange,
  pageIndex: number,
  totalPages: number
): void {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, layout.pageWidthPx, layout.pageHeightPx);

  drawPageCaption(ctx, page, pageIndex, totalPages, layout);

  ctx.save();
  ctx.translate(layout.gridOriginXPx, layout.gridOriginYPx);

  drawChart(ctx, pattern, mode, layout.cellSizePx, { x0: page.startX, y0: page.startY, x1: page.endX, y1: page.endY });

  const gridWidthPx = (page.endX - page.startX) * layout.cellSizePx;
  const gridHeightPx = (page.endY - page.startY) * layout.cellSizePx;
  drawOverlapBands(ctx, page, layout, overlapSidesForPage(page, layout), gridWidthPx, gridHeightPx);
  drawGlobalCoordinateNumbers(ctx, page, layout);

  ctx.restore();
}

export function renderA4GridPage(
  pattern: StitchPattern,
  mode: RenderMode,
  layout: A4Layout,
  page: PageRange,
  pageIndex: number,
  totalPages: number
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = layout.pageWidthPx;
  canvas.height = layout.pageHeightPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  drawA4GridPage(ctx, pattern, mode, layout, page, pageIndex, totalPages);

  return canvas;
}

// Sizes for the standalone legend page -- independent of the grid pages'
// own gutter constants, since this page has no chart/coordinate chrome to
// share space with, just a title and a swatch grid.
const LEGEND_TITLE_FONT_MM = 6;
const LEGEND_SWATCH_MM = 6;
const LEGEND_ROW_HEIGHT_MM = 9;
const LEGEND_COLUMN_WIDTH_MM = 45;
const LEGEND_NAME_FONT_MM = 3.2;
const LEGEND_DETAIL_FONT_MM = 2.6;

/**
 * Renders one standalone A4 page listing every palette color's swatch,
 * symbol, name, hex code, and stitch count -- included once per export
 * (Owner's choice, confirmed via AskUserQuestion 2026-09-10) so the printed
 * page set is self-contained without needing the separately-downloaded
 * full-chart PNG for reference. The grid pages themselves carry no legend.
 */
/** Drawing logic for the simple legend page, factored out for the same reason as `drawA4GridPage` -- see its own doc comment. */
export function drawA4LegendPage(ctx: ChartDrawingContext, pattern: StitchPattern, layout: A4Layout): void {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, layout.pageWidthPx, layout.pageHeightPx);

  const titleFontPx = mmToPx(LEGEND_TITLE_FONT_MM, layout.dpi);
  ctx.fillStyle = "#111111";
  ctx.font = `bold ${titleFontPx}px ${FONT_STACK}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("Legend", layout.marginPx, layout.marginPx);

  const swatchPx = mmToPx(LEGEND_SWATCH_MM, layout.dpi);
  const rowHeightPx = mmToPx(LEGEND_ROW_HEIGHT_MM, layout.dpi);
  const columnWidthPx = mmToPx(LEGEND_COLUMN_WIDTH_MM, layout.dpi);
  const nameFontPx = mmToPx(LEGEND_NAME_FONT_MM, layout.dpi);
  const detailFontPx = mmToPx(LEGEND_DETAIL_FONT_MM, layout.dpi);

  let gridTop = layout.marginPx + titleFontPx * 1.8;

  // What the grid pages' tinted bands mean, explained once here instead of
  // spelling out "OVERLAP" on every band of every page (Owner decision,
  // 2026-09-12) -- only shown when this export actually has overlap.
  if (layout.overlapCells > 0) {
    const noteSwatchPx = mmToPx(4, layout.dpi);
    const noteGapPx = mmToPx(2, layout.dpi);
    ctx.fillStyle = OVERLAP_TINT;
    ctx.fillRect(layout.marginPx, gridTop, noteSwatchPx, noteSwatchPx);
    ctx.strokeStyle = GRID_LINE_COLOR;
    ctx.lineWidth = 1;
    ctx.strokeRect(layout.marginPx, gridTop, noteSwatchPx, noteSwatchPx);

    ctx.fillStyle = "#7a5200";
    ctx.font = `${detailFontPx}px ${FONT_STACK}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(
      "Tinted bands on grid pages repeat on the adjacent page — don't stitch them twice.",
      layout.marginPx + noteSwatchPx + noteGapPx,
      gridTop + noteSwatchPx / 2
    );
    gridTop += noteSwatchPx + mmToPx(3, layout.dpi);
  }

  const printableWidthPx = layout.pageWidthPx - 2 * layout.marginPx;
  const columns = Math.max(1, Math.floor(printableWidthPx / columnWidthPx));

  pattern.palette.forEach((color, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const x = layout.marginPx + col * columnWidthPx;
    const y = gridTop + row * rowHeightPx;

    ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
    ctx.fillRect(x, y, swatchPx, swatchPx);
    ctx.strokeStyle = GRID_LINE_COLOR;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, swatchPx, swatchPx);

    ctx.fillStyle = luminance(color.rgb) > 140 ? "#000000" : "#ffffff";
    ctx.font = `${Math.round(swatchPx * 0.6)}px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(color.symbol, x + swatchPx / 2, y + swatchPx / 2 + 1);

    const textX = x + swatchPx + mmToPx(2, layout.dpi);
    const maxTextWidth = columnWidthPx - swatchPx - mmToPx(4, layout.dpi);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    ctx.fillStyle = "#111111";
    ctx.font = `${nameFontPx}px ${FONT_STACK}`;
    ctx.fillText(truncateToWidth(ctx, color.name, maxTextWidth), textX, y + swatchPx / 2 - detailFontPx * 0.6);

    ctx.fillStyle = "#666666";
    ctx.font = `${detailFontPx}px ${FONT_STACK}`;
    ctx.fillText(`${rgbToHex(color.rgb)} · ${color.count} sts`, textX, y + swatchPx / 2 + nameFontPx * 0.6);
  });
}

export function renderA4LegendPage(pattern: StitchPattern, layout: A4Layout): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = layout.pageWidthPx;
  canvas.height = layout.pageHeightPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  drawA4LegendPage(ctx, pattern, layout);

  return canvas;
}

// --- Extended legend / info page(s) (G-016) ---
//
// A separate page set from renderA4LegendPage above (which stays, per the
// Owner's explicit "simple legend should remain as well") -- this one leads
// with a title and a details table (stitch count, finished size, fabric,
// thread, color count), then a full "Color key" table with one row per
// color (symbol swatch, thread code when the pattern is brand-matched,
// name, stitch count, skein count). Unlike the simple legend's swatch grid, a
// one-row-per-color table with this much per-row detail can outgrow a
// single A4 page well within MAX_COLORS (100) -- e.g. at ~25 rows/page,
// exceeding it needs only 26+ colors -- so this is genuinely paginated,
// not a single fixed canvas.

const INFO_TITLE_FONT_MM = 6;
const INFO_LABEL_FONT_MM = 3.4;
const INFO_ROW_HEIGHT_MM = 7.5;
const INFO_LABEL_COLUMN_MM = 42;
const INFO_SECTION_GAP_MM = 6;

const KEY_TITLE_FONT_MM = 5;
const KEY_HEADER_FONT_MM = 3;
const KEY_NAME_FONT_MM = 3.2;
const KEY_ROW_HEIGHT_MM = 8;
const KEY_HEADER_ROW_HEIGHT_MM = 6.5;

/**
 * Splits a brand-matched pattern's `"CODE - Name"` color name back into
 * its parts for display -- purely cosmetic (which column shows what);
 * whether the pattern *is* brand-matched is decided once from
 * `pattern.threadBrand` (set by `applyBrandPalette`, generalized from
 * `dmcMode` in G-029 M1, HANDOVER.md D92), never re-derived by parsing
 * names here. The `"CODE - Name"` format itself is brand-agnostic --
 * every brand `applyBrandPalette` produces a color name uses it.
 *
 * When there's no `" - "` separator, the whole string is treated as the
 * CODE, not the name (G-029 M2, HANDOVER.md D93): this function is only
 * ever called on a brand-matched pattern's color name
 * (`hasThreadCode`-gated), and `formatThreadName` (lib/thread-brands.ts)
 * produces exactly this shape -- a bare code, no separator -- for a
 * brand with no published descriptive names (Cosmo). A bare code
 * belongs in the CODE column, not the Name column.
 */
export function splitThreadCodeName(fullName: string): { code: string; name: string } {
  const idx = fullName.indexOf(" - ");
  if (idx === -1) return { code: fullName, name: "" };
  return { code: fullName.slice(0, idx), name: fullName.slice(idx + 3) };
}

/**
 * "PATTERN_NAME by AUTHOR_NAME", falling back in each direction when
 * either is missing (Owner spec, 2026-09-10) -- never blank.
 */
export function infoPageTitle(patternName: string | undefined, authorName: string): string {
  const name = patternName?.trim();
  const author = authorName.trim();
  if (name && author) return `${name} by ${author}`;
  if (author) return `Cross stitch pattern by ${author}`;
  if (name) return name;
  return "Cross stitch pattern";
}

export function buildDetailRows(pattern: StitchPattern, aidaCount: number, sizeUnit: SizeUnit): Array<[string, string]> {
  const secondaryUnit: SizeUnit = sizeUnit === "in" ? "cm" : "in";
  const finishedPrimary = formatFinishedSize(pattern.width, pattern.height, aidaCount, sizeUnit);
  const finishedSecondary = formatFinishedSize(pattern.width, pattern.height, aidaCount, secondaryUnit);

  const rows: Array<[string, string]> = [
    ["Stitch count", `${pattern.width} × ${pattern.height} (${pattern.width * pattern.height} total)`],
    ["Finished size", `${finishedPrimary} (${finishedSecondary})`],
    ["Fabric", `${aidaCount}-count Aida`],
  ];
  if (pattern.threadBrand) rows.push(["Thread", THREAD_BRANDS[pattern.threadBrand].label]);
  rows.push(["Color count", `${pattern.palette.length} colors`]);
  return rows;
}

/** Two-column label/value table with a full grid (outer border + row/column rules) -- the details block at the top of page 1. */
function drawDetailsTable(ctx: ChartDrawingContext, x: number, y: number, width: number, rows: Array<[string, string]>, dpi: number): number {
  const rowHeightPx = mmToPx(INFO_ROW_HEIGHT_MM, dpi);
  const labelColWidthPx = mmToPx(INFO_LABEL_COLUMN_MM, dpi);
  const labelFontPx = mmToPx(INFO_LABEL_FONT_MM, dpi);
  const totalHeight = rows.length * rowHeightPx;

  rows.forEach(([label, value], i) => {
    const rowTop = y + i * rowHeightPx;
    const midY = rowTop + rowHeightPx / 2;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#555555";
    ctx.font = `${labelFontPx}px ${FONT_STACK}`;
    ctx.fillText(label, x + mmToPx(2, dpi), midY);
    ctx.fillStyle = "#111111";
    ctx.font = `bold ${labelFontPx}px ${FONT_STACK}`;
    ctx.fillText(value, x + labelColWidthPx + mmToPx(2, dpi), midY);
  });

  ctx.strokeStyle = GRID_LINE_COLOR;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, totalHeight);
  ctx.beginPath();
  ctx.moveTo(x + labelColWidthPx, y);
  ctx.lineTo(x + labelColWidthPx, y + totalHeight);
  ctx.stroke();
  for (let i = 1; i < rows.length; i++) {
    const ly = y + i * rowHeightPx;
    ctx.beginPath();
    ctx.moveTo(x, ly);
    ctx.lineTo(x + width, ly);
    ctx.stroke();
  }

  return y + totalHeight;
}

export interface KeyColumns {
  symbolX: number;
  symbolW: number;
  codeX: number;
  codeW: number;
  nameX: number;
  nameW: number;
  stitchX: number;
  stitchW: number;
  skeinX: number;
  skeinW: number;
  totalWidth: number;
}

export function computeKeyColumns(printableWidthPx: number, hasThreadCode: boolean, dpi: number = PRINT_DPI): KeyColumns {
  const symbolW = mmToPx(12, dpi);
  const codeW = hasThreadCode ? mmToPx(18, dpi) : 0;
  const stitchW = mmToPx(28, dpi);
  const skeinW = mmToPx(28, dpi);
  const nameW = Math.max(mmToPx(30, dpi), printableWidthPx - symbolW - codeW - stitchW - skeinW);

  let x = 0;
  const symbolX = x;
  x += symbolW;
  const codeX = x;
  x += codeW;
  const nameX = x;
  x += nameW;
  const stitchX = x;
  x += stitchW;
  const skeinX = x;
  x += skeinW;

  return { symbolX, symbolW, codeX, codeW, nameX, nameW, stitchX, stitchW, skeinX, skeinW, totalWidth: x };
}

/** Draws the "Color key" table's header row plus as many `colors` rows as given, with a full grid, starting at `(x, yStart)`. Returns the y just past the drawn block. */
function drawKeyTableBlock(
  ctx: ChartDrawingContext,
  x: number,
  yStart: number,
  cols: KeyColumns,
  hasThreadCode: boolean,
  colors: readonly PaletteColor[],
  aidaCount: number,
  dpi: number
): number {
  const headerHeightPx = mmToPx(KEY_HEADER_ROW_HEIGHT_MM, dpi);
  const rowHeightPx = mmToPx(KEY_ROW_HEIGHT_MM, dpi);
  const headerFontPx = mmToPx(KEY_HEADER_FONT_MM, dpi);
  const totalHeight = headerHeightPx + colors.length * rowHeightPx;

  // Header row background + text.
  ctx.fillStyle = "#f0f0f0";
  ctx.fillRect(x, yStart, cols.totalWidth, headerHeightPx);
  ctx.fillStyle = "#111111";
  ctx.font = `bold ${headerFontPx}px ${FONT_STACK}`;
  ctx.textBaseline = "middle";
  const headerMidY = yStart + headerHeightPx / 2;
  ctx.textAlign = "center";
  ctx.fillText("Symbol", x + cols.symbolX + cols.symbolW / 2, headerMidY);
  if (hasThreadCode) ctx.fillText("Color #", x + cols.codeX + cols.codeW / 2, headerMidY);
  ctx.textAlign = "left";
  ctx.fillText("Color name", x + cols.nameX + mmToPx(1.5, dpi), headerMidY);
  ctx.textAlign = "center";
  ctx.fillText("Stitch count", x + cols.stitchX + cols.stitchW / 2, headerMidY);
  ctx.fillText("Skein count", x + cols.skeinX + cols.skeinW / 2, headerMidY);

  // Data rows.
  colors.forEach((color, i) => {
    const rowTop = yStart + headerHeightPx + i * rowHeightPx;
    const midY = rowTop + rowHeightPx / 2;

    const swatchSize = Math.min(cols.symbolW - mmToPx(2, dpi), rowHeightPx - mmToPx(2, dpi));
    const swatchX = x + cols.symbolX + (cols.symbolW - swatchSize) / 2;
    const swatchY = rowTop + (rowHeightPx - swatchSize) / 2;
    ctx.fillStyle = `rgb(${color.rgb[0]}, ${color.rgb[1]}, ${color.rgb[2]})`;
    ctx.fillRect(swatchX, swatchY, swatchSize, swatchSize);
    ctx.strokeStyle = GRID_LINE_COLOR;
    ctx.lineWidth = 1;
    ctx.strokeRect(swatchX, swatchY, swatchSize, swatchSize);
    ctx.fillStyle = luminance(color.rgb) > 140 ? "#000000" : "#ffffff";
    ctx.font = `${Math.round(swatchSize * 0.55)}px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.fillText(color.symbol, swatchX + swatchSize / 2, midY + 1);

    const { code, name } = hasThreadCode ? splitThreadCodeName(color.name) : { code: "", name: color.name };

    if (hasThreadCode) {
      ctx.fillStyle = "#111111";
      ctx.font = `${headerFontPx}px ${FONT_STACK}`;
      ctx.textAlign = "center";
      ctx.fillText(code, x + cols.codeX + cols.codeW / 2, midY);
    }

    ctx.fillStyle = "#111111";
    ctx.font = `${mmToPx(KEY_NAME_FONT_MM, dpi)}px ${FONT_STACK}`;
    ctx.textAlign = "left";
    ctx.fillText(truncateToWidth(ctx, name, cols.nameW - mmToPx(3, dpi)), x + cols.nameX + mmToPx(1.5, dpi), midY);

    ctx.font = `${headerFontPx}px ${FONT_STACK}`;
    ctx.textAlign = "center";
    ctx.fillText(String(color.count), x + cols.stitchX + cols.stitchW / 2, midY);
    ctx.fillText(String(estimateSkeins(color.count, aidaCount)), x + cols.skeinX + cols.skeinW / 2, midY);
  });

  // Grid lines: outer rect, header/body divider (part of the row lines
  // below), per-row horizontal rules, and per-column vertical rules.
  ctx.strokeStyle = GRID_LINE_COLOR;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, yStart, cols.totalWidth, totalHeight);
  for (let i = 0; i <= colors.length; i++) {
    const ly = yStart + headerHeightPx + i * rowHeightPx;
    ctx.beginPath();
    ctx.moveTo(x, ly);
    ctx.lineTo(x + cols.totalWidth, ly);
    ctx.stroke();
  }
  const columnXs = [cols.symbolX, ...(hasThreadCode ? [cols.codeX] : []), cols.nameX, cols.stitchX, cols.skeinX];
  for (const colX of columnXs) {
    if (colX === 0) continue; // left edge already drawn by the outer rect
    ctx.beginPath();
    ctx.moveTo(x + colX, yStart);
    ctx.lineTo(x + colX, yStart + totalHeight);
    ctx.stroke();
  }

  return yStart + totalHeight;
}

function drawPageFooter(ctx: ChartDrawingContext, layout: A4Layout, pageIndex: number, totalPages: number) {
  if (totalPages <= 1) return;
  const fontPx = mmToPx(OVERLAP_LABEL_FONT_MM, layout.dpi);
  ctx.fillStyle = "#888888";
  ctx.font = `${fontPx}px ${FONT_STACK}`;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.fillText(`Page ${pageIndex} / ${totalPages}`, layout.pageWidthPx - layout.marginPx, layout.pageHeightPx - layout.marginPx * 0.5);
}

export interface A4InfoPageOptions {
  authorName: string;
  aidaCount: number;
  sizeUnit: SizeUnit;
}

/**
 * The pure pagination math behind the extended legend / info pages (G-016)
 * -- how many colors fit on page 1 vs each continuation page, and the
 * shared content (title, details rows, column layout) every page needs.
 * Factored out from `renderA4InfoPages` so G-026 M2's PDF exporter can plan
 * its own page count up front (it must call `doc.addPage` once per page
 * before drawing, unlike the canvas path's array-of-canvases return) using
 * the exact same math the canvas/PNG export already uses -- never a second,
 * possibly-drifting copy of it (HANDOVER.md D11/D74).
 */
export interface InfoPagesPlan {
  title: string;
  detailRows: Array<[string, string]>;
  cols: KeyColumns;
  hasThreadCode: boolean;
  printableWidthPx: number;
  rowsOnPage1: number;
  rowsPerContinuationPage: number;
  totalColors: number;
  totalPages: number;
}

export function planInfoPages(pattern: StitchPattern, layout: A4Layout, options: A4InfoPageOptions): InfoPagesPlan {
  const hasThreadCode = pattern.threadBrand !== undefined;
  const printableWidthPx = layout.pageWidthPx - 2 * layout.marginPx;
  const printableHeightPx = layout.pageHeightPx - 2 * layout.marginPx;

  const title = infoPageTitle(pattern.name, options.authorName);
  const detailRows = buildDetailRows(pattern, options.aidaCount, options.sizeUnit);
  const cols = computeKeyColumns(printableWidthPx, hasThreadCode, layout.dpi);

  const titleFontPx = mmToPx(INFO_TITLE_FONT_MM, layout.dpi);
  const gapPx = mmToPx(INFO_SECTION_GAP_MM, layout.dpi);
  const detailsTableHeightPx = detailRows.length * mmToPx(INFO_ROW_HEIGHT_MM, layout.dpi);
  const keyTitleFontPx = mmToPx(KEY_TITLE_FONT_MM, layout.dpi);
  const keyHeaderHeightPx = mmToPx(KEY_HEADER_ROW_HEIGHT_MM, layout.dpi);
  const keyRowHeightPx = mmToPx(KEY_ROW_HEIGHT_MM, layout.dpi);

  const page1FixedHeightPx = titleFontPx * 1.8 + gapPx + detailsTableHeightPx + gapPx + keyTitleFontPx * 1.6 + keyHeaderHeightPx;
  const continuationFixedHeightPx = mmToPx(CAPTION_FONT_MM, layout.dpi) * 1.8 + keyHeaderHeightPx;

  const rowsOnPage1 = Math.max(1, Math.floor((printableHeightPx - page1FixedHeightPx) / keyRowHeightPx));
  const rowsPerContinuationPage = Math.max(1, Math.floor((printableHeightPx - continuationFixedHeightPx) / keyRowHeightPx));

  const totalColors = pattern.palette.length;
  const remainingAfterPage1 = Math.max(0, totalColors - rowsOnPage1);
  const continuationPageCount = remainingAfterPage1 === 0 ? 0 : Math.ceil(remainingAfterPage1 / rowsPerContinuationPage);
  const totalPages = 1 + continuationPageCount;

  return { title, detailRows, cols, hasThreadCode, printableWidthPx, rowsOnPage1, rowsPerContinuationPage, totalColors, totalPages };
}

/** Draws info page 1's content (title, details table, color-key table start) -- see `planInfoPages`. */
export function drawInfoPage1(ctx: ChartDrawingContext, pattern: StitchPattern, plan: InfoPagesPlan, layout: A4Layout, aidaCount: number): void {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, layout.pageWidthPx, layout.pageHeightPx);

  const titleFontPx = mmToPx(INFO_TITLE_FONT_MM, layout.dpi);
  const gapPx = mmToPx(INFO_SECTION_GAP_MM, layout.dpi);
  const keyTitleFontPx = mmToPx(KEY_TITLE_FONT_MM, layout.dpi);

  let y = layout.marginPx;
  ctx.fillStyle = "#111111";
  ctx.font = `bold ${titleFontPx}px ${FONT_STACK}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(plan.title, layout.marginPx, y);
  y += titleFontPx * 1.8 + gapPx;

  y = drawDetailsTable(ctx, layout.marginPx, y, plan.printableWidthPx, plan.detailRows, layout.dpi);
  y += gapPx;

  ctx.fillStyle = "#111111";
  ctx.font = `bold ${keyTitleFontPx}px ${FONT_STACK}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("Color key", layout.marginPx, y);
  y += keyTitleFontPx * 1.6;

  const rowsOnPage1Actual = Math.min(plan.rowsOnPage1, plan.totalColors);
  drawKeyTableBlock(ctx, layout.marginPx, y, plan.cols, plan.hasThreadCode, pattern.palette.slice(0, rowsOnPage1Actual), aidaCount, layout.dpi);
  drawPageFooter(ctx, layout, 1, plan.totalPages);
}

/** Draws one "Color key (continued)" page's content -- see `planInfoPages`. `pageNumber` is this page's 1-based position in the whole info-pages document (page 1 is `drawInfoPage1`, so the first continuation page is 2). */
export function drawInfoContinuationPage(
  ctx: ChartDrawingContext,
  plan: InfoPagesPlan,
  colors: readonly PaletteColor[],
  pageNumber: number,
  layout: A4Layout,
  aidaCount: number
): void {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, layout.pageWidthPx, layout.pageHeightPx);

  const captionFontPx = mmToPx(CAPTION_FONT_MM, layout.dpi);
  let cy = layout.marginPx;
  ctx.fillStyle = "#111111";
  ctx.font = `bold ${captionFontPx}px ${FONT_STACK}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("Color key (continued)", layout.marginPx, cy);
  cy += captionFontPx * 1.8;

  drawKeyTableBlock(ctx, layout.marginPx, cy, plan.cols, plan.hasThreadCode, colors, aidaCount, layout.dpi);
  drawPageFooter(ctx, layout, pageNumber, plan.totalPages);
}

/**
 * Renders the extended legend / info page(s) (G-016): a title, a details
 * table (stitch count, finished size in both units, fabric, thread when
 * brand-matched, color count), and a full "Color key" table with one row per
 * palette color -- paginated across as many A4 pages as the color count
 * needs, continuing with a repeated table header on each extra page.
 * Returned alongside (not instead of) `renderA4LegendPage`'s compact
 * swatch-grid legend, per the Owner's explicit "simple legend should
 * remain as well."
 */
export function renderA4InfoPages(pattern: StitchPattern, layout: A4Layout, options: A4InfoPageOptions): HTMLCanvasElement[] {
  const plan = planInfoPages(pattern, layout, options);

  function newCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
    const canvas = document.createElement("canvas");
    canvas.width = layout.pageWidthPx;
    canvas.height = layout.pageHeightPx;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    return { canvas, ctx };
  }

  const pages: HTMLCanvasElement[] = [];

  const { canvas: page1, ctx: ctx1 } = newCanvas();
  drawInfoPage1(ctx1, pattern, plan, layout, options.aidaCount);
  pages.push(page1);

  let consumed = Math.min(plan.rowsOnPage1, plan.totalColors);
  for (let p = 0; p < plan.totalPages - 1; p++) {
    const { canvas, ctx } = newCanvas();
    const rowsHere = Math.min(plan.rowsPerContinuationPage, plan.totalColors - consumed);
    drawInfoContinuationPage(ctx, plan, pattern.palette.slice(consumed, consumed + rowsHere), p + 2, layout, options.aidaCount);
    consumed += rowsHere;
    pages.push(canvas);
  }

  return pages;
}
