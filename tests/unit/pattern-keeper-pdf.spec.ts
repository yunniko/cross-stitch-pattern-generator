import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { buildSpikePdf } from "@/lib/pattern-keeper-pdf";
import { SYMBOL_SET } from "@/lib/symbols";

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
