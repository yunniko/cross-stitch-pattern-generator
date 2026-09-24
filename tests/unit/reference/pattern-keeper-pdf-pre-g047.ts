// Frozen copy of buildPatternKeeperPdf as of G-047 M2 (commit 1d414e0), drawing through the frozen adapter beside it.
// The page drawing (a4-render.ts) and the flush are the live ones, so a comparison isolates the adapter.
import { PDFDocument, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { calculateA4Layout } from "@/lib/export/a4-layout";
import {
  drawA4GridPage,
  drawA4LegendPage,
  drawInfoContinuationPage,
  drawInfoPage1,
  planInfoPages,
  type A4InfoPageOptions,
} from "@/lib/export/a4-render";
import { DEFAULT_AIDA_COUNT, DEFAULT_SIZE_UNIT } from "@/lib/export/finished-size";
import { embedDejaVuSans, type PatternKeeperPdfOptions } from "@/lib/export/pattern-keeper-pdf";
import { flushFinishedPage } from "@/lib/export/pdf-page-flush";
import type { RenderMode } from "@/lib/export/render";
import type { StitchPattern } from "@/lib/types";
import { yieldToMain } from "@/lib/export/yield";
import { PdfCanvasAdapter, type FontMetricsSource } from "./pdf-canvas-adapter-pre-g047";

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
export async function buildPatternKeeperPdfPreG047(
  pattern: StitchPattern,
  mode: RenderMode,
  fontBytes: Uint8Array,
  options: PatternKeeperPdfOptions = {}
): Promise<Uint8Array> {
  const {
    aidaCount = DEFAULT_AIDA_COUNT,
    sizeUnit = DEFAULT_SIZE_UNIT,
    authorName = "",
    onProgress,
    retainPageOperators = false,
    ...layoutOptions
  } = options;
  const layout = calculateA4Layout(pattern.width, pattern.height, { ...layoutOptions, dpi: 72 });
  const metrics = fontMetricsFor(fontBytes);

  const doc = await PDFDocument.create();
  doc.setTitle(pattern.name?.trim() || "Cross stitch pattern");
  const font = await embedDejaVuSans(doc, fontBytes);
  const pageSize: [number, number] = [layout.pageWidthPx, layout.pageHeightPx];

  const totalGridPages = layout.pages.length;
  const infoOptions: A4InfoPageOptions = { authorName, aidaCount, sizeUnit };
  const plan = planInfoPages(pattern, layout, infoOptions);
  const totalPages = totalGridPages + 1 + plan.totalPages;
  let drawn = 0;
  // A drawn page's operators go as soon as it is finished, so memory holds one page however large the chart (D169).
  const pageDone = async (page: PDFPage) => {
    if (!retainPageOperators) flushFinishedPage(page);
    drawn++;
    onProgress?.({ completed: drawn, total: totalPages, label: `Page ${drawn} of ${totalPages}` });
    // Keeps the tab responsive between pages on the main-thread fallback (D079); returns at once in the worker.
    await yieldToMain();
  };

  for (let i = 0; i < layout.pages.length; i++) {
    const page = doc.addPage(pageSize);
    drawA4GridPage(new PdfCanvasAdapter(page, font, metrics), pattern, mode, layout, layout.pages[i], i, totalGridPages);
    await pageDone(page);
  }

  const legendPage = doc.addPage(pageSize);
  drawA4LegendPage(new PdfCanvasAdapter(legendPage, font, metrics), pattern, layout);
  await pageDone(legendPage);

  const infoPage = doc.addPage(pageSize);
  drawInfoPage1(new PdfCanvasAdapter(infoPage, font, metrics), pattern, plan, layout, aidaCount);
  await pageDone(infoPage);

  let consumed = Math.min(plan.rowsOnPage1, plan.totalColors);
  for (let p = 0; p < plan.totalPages - 1; p++) {
    const rowsHere = Math.min(plan.rowsPerContinuationPage, plan.totalColors - consumed);
    const page = doc.addPage(pageSize);
    drawInfoContinuationPage(
      new PdfCanvasAdapter(page, font, metrics),
      plan,
      pattern.palette.slice(consumed, consumed + rowsHere),
      p + 2,
      layout,
      aidaCount
    );
    consumed += rowsHere;
    await pageDone(page);
  }

  onProgress?.({ completed: totalPages, total: totalPages, label: "Saving PDF…" });
  return doc.save();
}
