import { readFileSync } from "node:fs";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { embedDejaVuSans } from "@/lib/export/pattern-keeper-pdf";
import { PdfCanvasAdapter, type FontMetricsSource } from "@/lib/export/pdf-canvas-adapter";

const fontBytes = new Uint8Array(readFileSync(join(process.cwd(), "public/fonts/DejaVuSans.ttf")));

/** Draws on a fresh page and returns how many resources of `kind` (ExtGState or Font) the page ended up with. */
async function resourceCountAfter(
  kind: "ExtGState" | "Font",
  draw: (ctx: PdfCanvasAdapter, fontWidth: (text: string, size: number) => number) => void
): Promise<number> {
  const doc = await PDFDocument.create();
  const font = await embedDejaVuSans(doc, fontBytes);
  const fk = fontkit.create(fontBytes);
  const metrics: FontMetricsSource = { ascent: fk.ascent, descent: fk.descent, unitsPerEm: fk.unitsPerEm };
  const page = doc.addPage([400, 400]);
  draw(new PdfCanvasAdapter(page, font, metrics), (text, size) => font.widthOfTextAtSize(text, size));
  const resources = page.node.Resources()?.lookupMaybe(PDFName.of(kind), PDFDict);
  return resources ? resources.keys().length : 0;
}

const extGStateCountAfter = (draw: Parameters<typeof resourceCountAfter>[1]) => resourceCountAfter("ExtGState", draw);

describe("PdfCanvasAdapter graphics-state resources (G-035 M2, D126)", () => {
  it("adds no graphics-state resource for opaque fills, strokes, lines and text", async () => {
    const count = await extGStateCountAfter((ctx) => {
      ctx.font = "10px Arial";
      for (let i = 0; i < 50; i++) {
        ctx.fillStyle = i % 2 ? "#336699" : "rgb(10, 20, 30)";
        ctx.fillRect(i, i, 5, 5);
        ctx.fillText("★", i, i);
        ctx.strokeStyle = "rgba(0, 0, 0, 1)";
        ctx.strokeRect(i, i, 5, 5);
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(100, i);
        ctx.stroke();
      }
    });
    expect(count).toBe(0);
  });

  it("registers the font once per page, however many symbols it draws", async () => {
    const count = await resourceCountAfter("Font", (ctx) => {
      ctx.fillStyle = "#000000";
      for (let i = 0; i < 200; i++) {
        ctx.font = `${8 + (i % 3)}px Arial`;
        ctx.fillText(i % 2 ? "★" : "Legend", i, i);
      }
    });
    expect(count).toBe(1);
  });

  it("still applies real transparency through a graphics state", async () => {
    const count = await extGStateCountAfter((ctx) => {
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.fillRect(0, 0, 10, 10);
    });
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it("measures text with the font's own widths, before and after the width cache fills", async () => {
    await extGStateCountAfter((ctx, fontWidth) => {
      for (const size of [8, 13]) {
        ctx.font = `${size}px Arial`;
        for (const text of ["★", "Legend", "★", "Legend"]) expect(ctx.measureText(text).width).toBe(fontWidth(text, size));
      }
    });
  });
});
