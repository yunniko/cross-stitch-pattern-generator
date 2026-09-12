import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

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
