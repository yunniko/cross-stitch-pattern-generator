import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { PDFDocument, PDFOperator, PDFOperatorNames } from "pdf-lib";
import { buildPatternKeeperPdf } from "@/lib/export/pattern-keeper-pdf";
import { flushFinishedPage } from "@/lib/export/pdf-page-flush";
import { SYMBOL_SET } from "@/lib/color/symbols";
import type { PaletteColor, RGB, StitchPattern } from "@/lib/types";

/**
 * G-046 M2 (D169): a finished page's operators are released before `save()`. The file must not change by one byte —
 * the flush writes the deflated stream `save()` would have written, at the same object number — and the release must
 * really happen, which depends on two private pdf-lib fields that this pins, so an upgrade cannot quietly undo it.
 */

const fontBytes = new Uint8Array(readFileSync(join(process.cwd(), "public/fonts/DejaVuSans.ttf")));

/** Spans several A4 grid pages, with two dozen colours laid out unevenly so no two pages draw alike. */
function makeMultiPagePattern(): StitchPattern {
  const colors: RGB[] = Array.from({ length: 24 }, (_, i) => [(i * 37) % 256, (i * 89) % 256, (i * 151) % 256]);
  const width = 130;
  const height = 110;
  const cellPalette = Uint8Array.from({ length: width * height }, (_, i) => ((i * 7) ^ (i >> 5)) % colors.length);
  const counts = new Array(colors.length).fill(0);
  for (const i of cellPalette) counts[i]++;
  const palette: PaletteColor[] = colors.map((rgb, i) => ({ index: i, rgb, symbol: SYMBOL_SET[i], name: `Colour ${i}`, count: counts[i] }));
  return { width, height, cellPalette, palette, isLandscape: false };
}

describe("releasing a finished page's operators", () => {
  it("writes exactly the bytes the file had when every page was kept until save", { timeout: 30_000 }, async () => {
    // pdf-lib stamps CreationDate and ModDate from the clock, so two builds a second apart differed there and nowhere
    // else -- this once passed only when both landed in the same second. Freezing the date, and no other timer, makes
    // it a strict comparison of everything else; the real pause between builds proves it no longer depends on timing.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-19T12:00:00Z"));
    try {
      const pattern = makeMultiPagePattern();
      const flushed = await buildPatternKeeperPdf(pattern, "color", fontBytes);
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const retained = await buildPatternKeeperPdf(pattern, "color", fontBytes, { retainPageOperators: true });
      expect((await PDFDocument.load(flushed)).getPageCount(), "the chart spans several grid pages").toBeGreaterThan(4);
      expect(flushed.length).toBe(retained.length);
      expect(Buffer.compare(Buffer.from(flushed), Buffer.from(retained))).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("finds pdf-lib's private page stream, and lets it go", async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([100, 100]);
    page.pushOperators(PDFOperator.of(PDFOperatorNames.PushGraphicsState), PDFOperator.of(PDFOperatorNames.PopGraphicsState));
    const internals = page as unknown as { contentStream?: unknown; contentStreamRef?: unknown };
    // Were a pdf-lib upgrade to rename these, the flush would quietly do nothing and memory would grow back.
    expect(internals.contentStream, "pdf-lib keeps the page's stream here").toBeDefined();
    expect(internals.contentStreamRef, "and its reference here").toBeDefined();
    flushFinishedPage(page);
    expect(internals.contentStream).toBeUndefined();
    expect(internals.contentStreamRef).toBeUndefined();
  });
});
