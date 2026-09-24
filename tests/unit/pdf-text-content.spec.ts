import { readFileSync } from "fs";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { calculateA4Layout, type OverlapCells } from "@/lib/export/a4-layout";
import { planInfoPages } from "@/lib/export/a4-render";
import { buildPatternKeeperPdf } from "@/lib/export/pattern-keeper-pdf";
import { SYMBOL_SET } from "@/lib/color/symbols";
import type { PaletteColor, RGB, StitchPattern } from "@/lib/types";
import { formatThreadName, THREAD_BRANDS } from "@/lib/threads/thread-brands";
import { buildPatternKeeperPdfPreG047 } from "./reference/pattern-keeper-pdf-pre-g047";

/**
 * G-047 M3 (D174): the PDF adapter writes its direct operators as text instead of building pdf-lib operator objects.
 * The file must not change by one byte, so every case is built by the live builder and by a frozen copy of the builder
 * and adapter from before M3, with the clock frozen, and the two files compared whole. The page drawing is shared, so a
 * difference can only come from the adapter.
 */

const fontBytes = new Uint8Array(readFileSync(join(process.cwd(), "public/fonts/DejaVuSans.ttf")));

/** Several A4 grid pages, two dozen colours laid out unevenly so no two pages draw alike. */
function multiPagePattern(): StitchPattern {
  const colors: RGB[] = Array.from({ length: 24 }, (_, i) => [(i * 37) % 256, (i * 89) % 256, (i * 151) % 256]);
  const width = 130;
  const height = 110;
  const cellPalette = Uint8Array.from({ length: width * height }, (_, i) => ((i * 7) ^ (i >> 5)) % colors.length);
  const counts = new Array(colors.length).fill(0);
  for (const i of cellPalette) counts[i]++;
  const palette: PaletteColor[] = colors.map((rgb, i) => ({ index: i, rgb, symbol: SYMBOL_SET[i], name: `Colour ${i}`, count: counts[i] }));
  return { width, height, cellPalette, palette, isLandscape: false, name: "Proof chart" };
}

async function expectIdentical(pattern: StitchPattern, mode: "color" | "bw", overlapCells: OverlapCells, authorName = ""): Promise<number> {
  const options = { overlapCells, authorName, aidaCount: 16, sizeUnit: "in" as const };
  const live = await buildPatternKeeperPdf(pattern, mode, fontBytes, options);
  const frozen = await buildPatternKeeperPdfPreG047(pattern, mode, fontBytes, options);
  expect(live.length, `${mode}, overlap ${overlapCells}: file length`).toBe(frozen.length);
  expect(Buffer.compare(Buffer.from(live), Buffer.from(frozen)), `${mode}, overlap ${overlapCells}: bytes`).toBe(0);
  return (await PDFDocument.load(live)).getPageCount();
}

describe("the PDF written as text", () => {
  beforeEach(() => {
    // pdf-lib stamps CreationDate and ModDate from the clock; freezing only the date keeps the comparison strict.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-19T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is byte-identical to the operator-object PDF in colour and black and white, at every overlap", async () => {
    const pattern = multiPagePattern();
    for (const mode of ["color", "bw"] as const) {
      for (const overlap of [0, 5, 10] as const) {
        expect(await expectIdentical(pattern, mode, overlap, "Ana")).toBeGreaterThan(4);
      }
    }
  }, 120_000);

  it("is byte-identical for a thread-matched chart whose colour key runs onto continuation pages", async () => {
    // Forty real DMC threads over a generated chart's layout: snapping a photo merges too many to spill the key.
    // A generated chart's shape, without generating one: this case is about the PDF's bytes, and every cell
    // and colour below is replaced anyway. 90x60 is what a 150x100 photo gave at 90 stitches (G-068 M3).
    const base: StitchPattern = { width: 90, height: 60, cellPalette: new Uint8Array(90 * 60), palette: [], isLandscape: true };
    const threads = THREAD_BRANDS.dmc.colors.slice(0, 40);
    const cellPalette = Uint8Array.from(base.cellPalette, (_, i) => (i * 13 + (i >> 4)) % threads.length);
    const counts = new Array(threads.length).fill(0);
    for (const i of cellPalette) counts[i]++;
    const palette: PaletteColor[] = threads.map((thread, i) => ({
      index: i,
      rgb: thread.rgb,
      symbol: SYMBOL_SET[i],
      name: formatThreadName(thread),
      count: counts[i],
      source: { brand: "dmc", code: thread.code },
    }));
    const pattern: StitchPattern = { ...base, cellPalette, palette, threadBrand: "dmc" };
    const layout = calculateA4Layout(pattern.width, pattern.height, { overlapCells: 5, dpi: 72 });
    const plan = planInfoPages(pattern, layout, { authorName: "", aidaCount: 16, sizeUnit: "in" });
    expect(plan.hasThreadCode).toBe(true);
    expect(plan.totalPages, "colour key pages").toBeGreaterThan(1);
    expect(await expectIdentical(pattern, "color", 5)).toBe(layout.pages.length + 1 + plan.totalPages);
  }, 120_000);
});
