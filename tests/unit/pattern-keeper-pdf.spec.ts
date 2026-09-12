import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { buildSpikePdf, buildPatternKeeperPdf } from "@/lib/pattern-keeper-pdf";
import { mmToPx } from "@/lib/a4-layout";
import { SYMBOL_SET } from "@/lib/symbols";
import type { PaletteColor, RGB, StitchPattern } from "@/lib/types";

/**
 * G-026 M1 (HANDOVER.md — see G-026 progress log): verifies the spike PDF
 * actually contains real, extractable vector text -- the programmatic proxy
 * for "select as text in a standard PDF viewer," Pattern Keeper's own
 * stated requirement. Uses `pdfjs-dist` (the same engine Firefox's built-in
 * PDF viewer uses) to extract text from the generated PDF and confirm the
 * drawn symbols round-trip back out as real characters, not just pixels --
 * a PDF with outlined/converted-to-curves glyphs or a rasterized image
 * would extract EMPTY text here, which is exactly the silent failure mode
 * this test exists to catch before any further work is built on top of it.
 */

const fontBytes = new Uint8Array(readFileSync(join(process.cwd(), "public/fonts/DejaVuSans.ttf")));

async function extractText(pdfBytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({ data: pdfBytes, useWorkerFetch: false });
  const doc = await loadingTask.promise;
  let text = "";
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((item) => ("str" in item ? item.str : "")).join("");
  }
  return text;
}

describe("buildSpikePdf: real, extractable vector text (the 'select as text' proxy)", () => {
  it("a handful of real symbols round-trip back out as extractable text", async () => {
    const symbols = ["A", "5", "★", "→", "≈"];
    const pdfBytes = await buildSpikePdf(fontBytes, symbols);
    expect(pdfBytes.length).toBeGreaterThan(0);

    const extracted = await extractText(pdfBytes);
    for (const symbol of symbols) {
      expect(extracted).toContain(symbol);
    }
  });

  it("every symbol in the app's real 100-symbol set is individually extractable", async () => {
    // Not just a handful -- the full set actually used in real patterns,
    // per this project's own D18 "verify broadly, not one attractive
    // example" discipline. One page, small grid, still a real PDF.
    //
    // KNOWN CAVEAT, found and verified directly (not assumed): "µ"
    // (U+00B5 MICRO SIGN) round-trips through pdfjs-dist's own text
    // extraction as "μ" (U+03BC GREEK SMALL LETTER MU) instead -- a
    // well-known, visually-identical Unicode compatibility pair (most
    // fonts, DejaVu Sans included, render both from effectively the same
    // glyph; µ exists mainly for legacy Latin-1 compatibility). Confirmed
    // via a minimal single-character isolation test that this is a
    // pdfjs-dist text-extraction/ToUnicode-mapping behavior, not a font
    // coverage gap (the drawn glyph is correct; only the extracted
    // *codepoint identity* differs) and not specific to the full-set
    // rendering here. Accepted as either character for this symbol only;
    // flagged for M4's real Pattern Keeper import test to specifically
    // confirm Pattern Keeper's own symbol matching tolerates it too.
    const pdfBytes = await buildSpikePdf(fontBytes, [...SYMBOL_SET], 10);
    const extracted = await extractText(pdfBytes);
    const missing = SYMBOL_SET.filter((s) => !extracted.includes(s) && !(s === "µ" && extracted.includes("μ")));
    expect(missing).toEqual([]);
  });

  it("produces a real PDF file (starts with the %PDF- magic bytes)", async () => {
    const pdfBytes = await buildSpikePdf(fontBytes, ["A", "B"]);
    const header = new TextDecoder().decode(pdfBytes.slice(0, 5));
    expect(header).toBe("%PDF-");
  });
});

/** A pattern using every one of the app's 100 real symbols, at least once each, spread over a small but non-trivial grid -- G-026 M2's full-pipeline check. */
function makeFullSymbolSetPattern(): StitchPattern {
  const colors: RGB[] = Array.from({ length: SYMBOL_SET.length }, (_, i) => [(i * 37) % 256, (i * 89) % 256, (i * 151) % 256]);
  const width = 20;
  const height = 20;
  const cellPalette = Array.from({ length: width * height }, (_, i) => i % colors.length);
  const counts = new Array(colors.length).fill(0);
  for (const i of cellPalette) counts[i]++;
  const palette: PaletteColor[] = colors.map((rgb, i) => ({ index: i, rgb, symbol: SYMBOL_SET[i], name: `Reference color ${i}`, count: counts[i] }));
  return { width, height, cellPalette: Uint8Array.from(cellPalette), palette, isLandscape: false };
}

async function extractPagesWithTransforms(pdfBytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({ data: pdfBytes, useWorkerFetch: false });
  const doc = await loadingTask.promise;
  const pages: Array<Array<{ str: string; transform: number[] }>> = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.flatMap((item) => ("str" in item && "transform" in item ? [{ str: item.str, transform: item.transform }] : [])));
  }
  return pages;
}

describe("buildPatternKeeperPdf: the real exporter (G-026 M2)", () => {
  it("produces a real, valid PDF with one page per grid fragment plus legend and info pages", async () => {
    const pattern = makeFullSymbolSetPattern();
    const pdfBytes = await buildPatternKeeperPdf(pattern, "color", fontBytes);
    expect(new TextDecoder().decode(pdfBytes.slice(0, 5))).toBe("%PDF-");

    const pages = await extractPagesWithTransforms(pdfBytes);
    // 1 grid page (20x20 comfortably fits one default A4 page) + 1 simple
    // legend + at least 1 extended-legend page (100 colors need more than
    // one at ~25 rows/page).
    expect(pages.length).toBeGreaterThanOrEqual(3);
  });

  it("every one of the 100 real symbols is extractable somewhere in the document, at the actual print size -- not just present in the legend", async () => {
    const pattern = makeFullSymbolSetPattern();
    const pdfBytes = await buildPatternKeeperPdf(pattern, "color", fontBytes);
    const pages = await extractPagesWithTransforms(pdfBytes);
    const allText = pages.flat().map((item) => item.str).join("");
    // Same documented µ/μ caveat as buildSpikePdf's own test above.
    const missing = SYMBOL_SET.filter((s) => !allText.includes(s) && !(s === "µ" && allText.includes("μ")));
    expect(missing).toEqual([]);

    // The grid page (page 1) specifically must carry the symbols too, not
    // just the legend/color-key pages -- a symbol found only in the legend
    // would hide an actual grid-drawing gap.
    const gridPageText = pages[0].map((item) => item.str).join("");
    for (const symbol of pattern.palette.slice(0, 20).map((c) => c.symbol)) {
      expect(gridPageText.includes(symbol) || (symbol === "µ" && gridPageText.includes("μ"))).toBe(true);
    }
  });

  it("resolves mm-based sizing at 72 DPI (points), not the 300-DPI default the canvas/PNG export uses -- guards the exact bug a Codex design critique found before this existed (HANDOVER.md D74)", async () => {
    const pattern = { ...makeFullSymbolSetPattern(), width: 5, height: 5, cellPalette: Uint8Array.from(new Array(25).fill(0)) };
    const pdfBytes = await buildPatternKeeperPdf(pattern, "color", fontBytes);
    const pages = await extractPagesWithTransforms(pdfBytes);
    const legendPage = pages[1]; // grid page, then simple legend
    const legendTitle = legendPage.find((item) => item.str === "Legend");
    expect(legendTitle).toBeDefined();
    // transform[0] is the effective font size (unrotated text) -- must match
    // mmToPx(LEGEND_TITLE_FONT_MM, 72), never the 300-DPI value (which would
    // be roughly 4x too large and instantly fail this check).
    const LEGEND_TITLE_FONT_MM = 6; // kept in sync with lib/a4-render.ts's own constant
    expect(legendTitle!.transform[0]).toBeCloseTo(mmToPx(LEGEND_TITLE_FONT_MM, 72), 0);
  });
});
