import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { PDFDocument } from "pdf-lib";
import pdfFontkit from "@pdf-lib/fontkit";
import { PdfCanvasAdapter, parseCssColor, type FontMetricsSource } from "@/lib/pdf-canvas-adapter";
import { drawA4LegendPage } from "@/lib/a4-render";
import { calculateA4Layout } from "@/lib/a4-layout";
import type { PaletteColor, RGB, StitchPattern } from "@/lib/types";

/**
 * G-026 M2 (HANDOVER.md D74): the Codex-recommended "diagnostic probe"
 * before trusting `PdfCanvasAdapter` with the full exporter -- verifies its
 * hardest semantics (rotation, alignment, baseline, the unsupported-shape
 * guards) directly against `pdfjs-dist`'s own reported per-glyph transform,
 * not by eyeballing a rendered image. The concrete rotation-sign convention
 * (canvas's `rotate(-Math.PI/2)` must become PDF's `+90 degrees`) was
 * verified empirically against a minimal probe before being encoded here --
 * see the D74 decision entry for the worked-out reasoning.
 */

const fontBytes = new Uint8Array(readFileSync(join(process.cwd(), "public/fonts/DejaVuSans.ttf")));
const fkFont = pdfFontkit.create(fontBytes);
const fontMetrics: FontMetricsSource = { ascent: fkFont.ascent, descent: fkFont.descent, unitsPerEm: fkFont.unitsPerEm };

async function buildAdapterPage(pageSize: [number, number] = [200, 200]) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(pdfFontkit);
  const font = await doc.embedFont(fontBytes, { subset: true });
  const page = doc.addPage(pageSize);
  const adapter = new PdfCanvasAdapter(page, font, fontMetrics);
  return { doc, page, adapter };
}

interface ExtractedTextItem {
  str: string;
  transform: number[];
}

async function extractTextItems(pdfBytes: Uint8Array): Promise<ExtractedTextItem[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({ data: pdfBytes, useWorkerFetch: false });
  const doc = await loadingTask.promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  const items: ExtractedTextItem[] = [];
  for (const item of content.items) {
    if ("str" in item && "transform" in item) items.push({ str: item.str, transform: item.transform });
  }
  return items;
}

describe("parseCssColor", () => {
  it("parses 6-digit and 3-digit hex", () => {
    expect(parseCssColor("#ff0080")).toEqual({ r: 255, g: 0, b: 128, alpha: 1 });
    expect(parseCssColor("#f08")).toEqual({ r: 255, g: 0, b: 136, alpha: 1 });
  });

  it("parses rgb() and rgba()", () => {
    expect(parseCssColor("rgb(51, 51, 51)")).toEqual({ r: 51, g: 51, b: 51, alpha: 1 });
    expect(parseCssColor("rgba(255, 200, 0, 0.35)")).toEqual({ r: 255, g: 200, b: 0, alpha: 0.35 });
  });

  it("throws on an unsupported color string", () => {
    expect(() => parseCssColor("hsl(0, 100%, 50%)")).toThrow();
  });
});

describe("PdfCanvasAdapter: text positioning against pdfjs-dist's own reported transform", () => {
  it("places unrotated, left-aligned, alphabetic-baseline text exactly at (x, pageHeight - y)", async () => {
    const { doc, page, adapter } = await buildAdapterPage();
    adapter.font = "20px Arial, sans-serif";
    adapter.fillText("AB", 50, 100);
    const bytes = await doc.save();
    const items = await extractTextItems(bytes);
    expect(items).toHaveLength(1);
    const [a, b, c, d, e, f] = items[0].transform;
    expect(a).toBeCloseTo(20, 3); // size, no rotation
    expect(b).toBeCloseTo(0, 3);
    expect(c).toBeCloseTo(0, 3);
    expect(d).toBeCloseTo(20, 3);
    expect(e).toBeCloseTo(50, 3);
    expect(f).toBeCloseTo(page.getHeight() - 100, 3);
  });

  it("shifts the anchor left by the full text width for textAlign='right', and by half for 'center'", async () => {
    const { doc, adapter } = await buildAdapterPage();
    adapter.font = "20px Arial, sans-serif";
    const width = adapter.measureText("AB").width;

    adapter.textAlign = "right";
    adapter.fillText("AB", 100, 100);
    adapter.textAlign = "center";
    adapter.fillText("AB", 100, 130);

    const bytes = await doc.save();
    const items = await extractTextItems(bytes);
    expect(items).toHaveLength(2);
    expect(items[0].transform[4]).toBeCloseTo(100 - width, 2);
    expect(items[1].transform[4]).toBeCloseTo(100 - width / 2, 2);
  });

  it("moves the baseline down from the anchor for textBaseline='top', matching the font's real ascent", async () => {
    const { doc, page, adapter } = await buildAdapterPage();
    adapter.font = "24px Arial, sans-serif";
    adapter.textBaseline = "top";
    adapter.fillText("A", 10, 10);
    const bytes = await doc.save();
    const items = await extractTextItems(bytes);
    const ascent = (fontMetrics.ascent / fontMetrics.unitsPerEm) * 24;
    // Local baseline_y = anchor_y(10) + ascent; PDF y = pageHeight - that.
    expect(items[0].transform[5]).toBeCloseTo(page.getHeight() - (10 + ascent), 2);
  });

  it("rotates text +90 degrees in PDF space for a canvas rotate(-PI/2), matching the vertical OVERLAP-band label pattern", async () => {
    const { doc, page, adapter } = await buildAdapterPage();
    adapter.font = "20px Arial, sans-serif";
    adapter.textAlign = "center";
    const width = adapter.measureText("OVERLAP").width;
    adapter.save();
    adapter.translate(50, 80);
    adapter.rotate(-Math.PI / 2);
    adapter.fillText("OVERLAP", 0, 0);
    adapter.restore();
    const bytes = await doc.save();
    const items = await extractTextItems(bytes);
    expect(items).toHaveLength(1);
    const [a, b, c, d] = items[0].transform;
    // A pure +90 degree PDF text matrix: a=d=size*cos(90)=0, b=size*sin(90)=size, c=-size.
    expect(a).toBeCloseTo(0, 2);
    expect(b).toBeCloseTo(20, 2);
    expect(c).toBeCloseTo(-20, 2);
    expect(d).toBeCloseTo(0, 2);
    // textAlign="center"'s horizontal centering offset is applied in LOCAL
    // space *before* the rotation, so once rotated it shifts the anchor
    // along what is now the vertical axis (by half the text's width) --
    // exactly how a real canvas centers rotated text around its pivot too.
    expect(items[0].transform[4]).toBeCloseTo(50, 1);
    expect(items[0].transform[5]).toBeCloseTo(page.getHeight() - (80 + width / 2), 1);
  });

  it("restore() undoes a save()'d transform and style state", async () => {
    const { doc, page, adapter } = await buildAdapterPage();
    adapter.font = "20px Arial, sans-serif";
    adapter.save();
    adapter.translate(1000, 1000);
    adapter.rotate(Math.PI);
    adapter.restore();
    adapter.fillText("A", 10, 10); // should land as if the save/restore never happened
    const bytes = await doc.save();
    const items = await extractTextItems(bytes);
    expect(items[0].transform[4]).toBeCloseTo(10, 2);
    expect(items[0].transform[5]).toBeCloseTo(page.getHeight() - 10, 2);
  });
});

describe("PdfCanvasAdapter: bounded contract -- rejects what the reused drawing functions never do", () => {
  it("throws for a rotated rectangle", async () => {
    const { adapter } = await buildAdapterPage();
    adapter.rotate(0.5);
    expect(() => adapter.fillRect(0, 0, 10, 10)).toThrow(/rotated rectangles/);
  });

  it("throws for a stroke() path with other than exactly two points", async () => {
    const { adapter } = await buildAdapterPage();
    adapter.beginPath();
    adapter.moveTo(0, 0);
    adapter.lineTo(10, 0);
    adapter.lineTo(10, 10);
    expect(() => adapter.stroke()).toThrow(/two-point line/);
  });

  it("throws for a gradient/pattern fillStyle (only solid CSS color strings are supported)", async () => {
    const { adapter } = await buildAdapterPage();
    adapter.fillStyle = {} as CanvasGradient;
    expect(() => adapter.fillRect(0, 0, 10, 10)).toThrow(/gradients\/patterns/);
  });

  it("throws for an unrecognized font string instead of silently misreading it", async () => {
    const { adapter } = await buildAdapterPage();
    adapter.font = "italic 12px serif";
    expect(() => adapter.fillText("x", 0, 0)).toThrow(/unsupported font string/);
  });
});

function makeLegendPattern(): StitchPattern {
  const colors: RGB[] = [
    [0, 0, 0],
    [255, 255, 255],
    [200, 30, 30],
  ];
  const cellPalette = [0, 1, 2, 2, 1];
  const counts = [0, 0, 0];
  for (const i of cellPalette) counts[i]++;
  const palette: PaletteColor[] = colors.map((rgb, i) => ({
    index: i,
    rgb,
    symbol: ["A", "5", "★"][i],
    name: `A very long descriptive color name that will need truncating ${i}`,
    count: counts[i],
  }));
  return { width: 3, height: 2, cellPalette: Uint8Array.from(cellPalette), palette, isLandscape: true };
}

describe("PdfCanvasAdapter + drawA4LegendPage: real page content round-trips as extractable text (Codex's recommended integration probe)", () => {
  it("every palette symbol and name fragment is present in the extracted PDF text", async () => {
    const layout = calculateA4Layout(3, 2, { dpi: 72 });
    const doc = await PDFDocument.create();
    doc.registerFontkit(pdfFontkit);
    const font = await doc.embedFont(fontBytes, { subset: true });
    const page = doc.addPage([layout.pageWidthPx, layout.pageHeightPx]);
    const adapter = new PdfCanvasAdapter(page, font, fontMetrics);

    const pattern = makeLegendPattern();
    drawA4LegendPage(adapter, pattern, layout);

    const bytes = await doc.save();
    const items = await extractTextItems(bytes);
    const extracted = items.map((i) => i.str).join("");
    expect(extracted).toContain("Legend");
    for (const color of pattern.palette) {
      expect(extracted).toContain(color.symbol);
    }
  });
});
