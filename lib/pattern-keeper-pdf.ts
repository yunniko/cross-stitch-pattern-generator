import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { calculateA4Layout, type A4LayoutOptions } from "./a4-layout";
import { drawA4GridPage, drawA4LegendPage, drawInfoContinuationPage, drawInfoPage1, planInfoPages, type A4InfoPageOptions } from "./a4-render";
import { DEFAULT_AIDA_COUNT, DEFAULT_SIZE_UNIT, type SizeUnit } from "./finished-size";
import { PdfCanvasAdapter, type FontMetricsSource } from "./pdf-canvas-adapter";
import type { RenderMode } from "./render";
import type { StitchPattern } from "./types";

/**
 * G-026 M1 (spike): the core primitive for the Pattern Keeper-compatible
 * PDF export -- draw a stitch symbol as REAL, embedded-font vector text
 * (not an image, not an outlined/converted-to-curves glyph), which Pattern
 * Keeper's own grid-detection and symbol search requires (see this
 * project's GOALS.md G-026 entry and `docs/dejavu-font-provenance.md` for
 * the font choice/coverage verification).
 *
 * Deliberately minimal at this stage: draws a small grid of cells, each
 * with one real vector-text symbol, plus vector gridlines -- exactly
 * enough to self-verify the "select as text in a standard PDF viewer"
 * requirement before M2 builds the real exporter (full pagination reusing
 * `lib/a4-layout.ts`, a real legend page, etc.).
 */

export interface SpikeGridOptions {
  /** One symbol per cell, row-major. */
  symbols: string[];
  columns: number;
  cellSizePt: number;
  /** Points of margin around the grid. */
  margin: number;
}

export async function embedDejaVuSans(doc: PDFDocument, fontBytes: Uint8Array): Promise<PDFFont> {
  doc.registerFontkit(fontkit);
  // `subset: true` embeds only the glyphs actually used, keeping file size
  // reasonable for a chart with a handful of distinct symbols out of the
  // font's full character set -- standard practice for embedded-font PDFs,
  // and Pattern Keeper's own requirement is real vector TEXT with correct
  // encoding, not an unsubsetted font specifically.
  return doc.embedFont(fontBytes, { subset: true });
}

/**
 * Draws a minimal grid of real vector-text symbols plus vector gridlines
 * onto `page`, using `font` (already embedded via `embedDejaVuSans`).
 * Returns the pixel bounds actually drawn, for layout purposes.
 */
export function drawSymbolGrid(page: PDFPage, font: PDFFont, options: SpikeGridOptions): { width: number; height: number } {
  const { symbols, columns, cellSizePt, margin } = options;
  const rows = Math.ceil(symbols.length / columns);
  const gridWidth = columns * cellSizePt;
  const gridHeight = rows * cellSizePt;

  // Vector gridlines first, so text draws on top.
  for (let c = 0; c <= columns; c++) {
    const x = margin + c * cellSizePt;
    page.drawLine({
      start: { x, y: margin },
      end: { x, y: margin + gridHeight },
      thickness: 0.5,
      color: rgb(0.6, 0.6, 0.6),
    });
  }
  for (let r = 0; r <= rows; r++) {
    const y = margin + r * cellSizePt;
    page.drawLine({
      start: { x: margin, y },
      end: { x: margin + gridWidth, y },
      thickness: 0.5,
      color: rgb(0.6, 0.6, 0.6),
    });
  }

  // One real vector-text glyph per cell, centered (approximately -- good
  // enough for the M1 spike; precise metric-based centering is M2's job).
  const fontSize = cellSizePt * 0.6;
  symbols.forEach((symbol, i) => {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const cellX = margin + col * cellSizePt;
    // PDF's origin is bottom-left; row 0 should render at the TOP of the grid.
    const cellYFromTop = margin + gridHeight - (row + 1) * cellSizePt;

    const textWidth = font.widthOfTextAtSize(symbol, fontSize);
    const x = cellX + (cellSizePt - textWidth) / 2;
    const y = cellYFromTop + cellSizePt * 0.25;

    page.drawText(symbol, { x, y, size: fontSize, font, color: rgb(0, 0, 0) });
  });

  return { width: gridWidth, height: gridHeight };
}

export async function buildSpikePdf(fontBytes: Uint8Array, symbols: string[], columns = 5): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await embedDejaVuSans(doc, fontBytes);

  const cellSizePt = 24;
  const margin = 20;
  const rows = Math.ceil(symbols.length / columns);
  const pageWidth = columns * cellSizePt + margin * 2;
  const pageHeight = rows * cellSizePt + margin * 2;

  const page = doc.addPage([pageWidth, pageHeight]);
  drawSymbolGrid(page, font, { symbols, columns, cellSizePt, margin });

  return doc.save();
}

// --- G-026 M2: the real, full exporter ------------------------------------
//
// Reuses the exact same page content as the existing "Export as A4 pages"
// PNG/ZIP export (`lib/a4-export.ts`) -- `drawA4GridPage`/`drawA4LegendPage`/
// `planInfoPages`+`drawInfoPage1`/`drawInfoContinuationPage`, all from
// `lib/a4-render.ts` -- by drawing them onto a `PdfCanvasAdapter` instead of
// a real canvas, one page per `PDFDocument.addPage` call. This is what
// makes the PDF's layout, tables, and coordinate numbering provably the
// same content as the already-shipped export, rather than a second,
// independently-written implementation that could drift from it
// (HANDOVER.md D11/D74). `calculateA4Layout` is called with `dpi: 72` so
// its own pixel output is already PDF-native points -- see D73/D74.

export interface PatternKeeperPdfOptions extends A4LayoutOptions {
  aidaCount?: number;
  sizeUnit?: SizeUnit;
  authorName?: string;
}

function fontMetricsFor(fontBytes: Uint8Array): FontMetricsSource {
  const fkFont = fontkit.create(fontBytes);
  return { ascent: fkFont.ascent, descent: fkFont.descent, unitsPerEm: fkFont.unitsPerEm };
}

/**
 * Builds the complete Pattern Keeper-compatible PDF: one page per A4 grid
 * fragment (in the same row-major, global-coordinate order as the PNG
 * export), one simple-legend page, then one or more extended-legend/color-
 * key pages -- all real, extractable vector text and vector gridlines, no
 * rasterized image anywhere. `fontBytes` is passed in (not read from disk
 * here) so this function works the same in a browser (`fetch`) and in
 * tests (`fs.readFileSync`), matching M1's `buildSpikePdf`'s own contract.
 */
export async function buildPatternKeeperPdf(
  pattern: StitchPattern,
  mode: RenderMode,
  fontBytes: Uint8Array,
  options: PatternKeeperPdfOptions = {}
): Promise<Uint8Array> {
  const { aidaCount = DEFAULT_AIDA_COUNT, sizeUnit = DEFAULT_SIZE_UNIT, authorName = "", ...layoutOptions } = options;
  const layout = calculateA4Layout(pattern.width, pattern.height, { ...layoutOptions, dpi: 72 });
  const metrics = fontMetricsFor(fontBytes);

  const doc = await PDFDocument.create();
  doc.setTitle(pattern.name?.trim() || "Cross stitch pattern");
  const font = await embedDejaVuSans(doc, fontBytes);
  const pageSize: [number, number] = [layout.pageWidthPx, layout.pageHeightPx];

  const totalGridPages = layout.pages.length;
  for (let i = 0; i < layout.pages.length; i++) {
    const adapter = new PdfCanvasAdapter(doc.addPage(pageSize), font, metrics);
    drawA4GridPage(adapter, pattern, mode, layout, layout.pages[i], i, totalGridPages);
  }

  drawA4LegendPage(new PdfCanvasAdapter(doc.addPage(pageSize), font, metrics), pattern, layout);

  const infoOptions: A4InfoPageOptions = { authorName, aidaCount, sizeUnit };
  const plan = planInfoPages(pattern, layout, infoOptions);
  drawInfoPage1(new PdfCanvasAdapter(doc.addPage(pageSize), font, metrics), pattern, plan, layout, aidaCount);

  let consumed = Math.min(plan.rowsOnPage1, plan.totalColors);
  for (let p = 0; p < plan.totalPages - 1; p++) {
    const rowsHere = Math.min(plan.rowsPerContinuationPage, plan.totalColors - consumed);
    const adapter = new PdfCanvasAdapter(doc.addPage(pageSize), font, metrics);
    drawInfoContinuationPage(adapter, plan, pattern.palette.slice(consumed, consumed + rowsHere), p + 2, layout, aidaCount);
    consumed += rowsHere;
  }

  return doc.save();
}
