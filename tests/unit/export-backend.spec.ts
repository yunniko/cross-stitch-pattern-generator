import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setExportBackend } from "@/lib/export/canvas-backend";
import { installServerExportBackend, registerExportFonts, serverExportBackend } from "@/processor/export-backend";
import { renderPatternToCanvas, renderStitchPreviewToCanvas } from "@/lib/export/render";
import { createBlankPattern } from "@/lib/editor/blank-pattern";
import { EMPTY_CELL, type PaletteColor, type StitchPattern } from "@/lib/types";

/**
 * The server's export environment actually draws (G-034 M4, D153).
 *
 * The processor image ships no fonts, which made every measured text width zero — charts would have come out
 * structurally wrong rather than merely different. These cases install the real backend and render through the
 * unmodified drawing code, so a missing font or a broken canvas cast fails here instead of in a downloaded file.
 */

// The repo's own assets stand in for the ones copied into the image.
process.env.EXPORT_ASSET_ROOT = path.join(__dirname, "..", "..", "public");

/** A small chart with something actually stitched, so the legend and symbols are drawn. MIN_STITCHES is 10 per side. */
function smallChart(): StitchPattern {
  const pattern = createBlankPattern(12, 10);
  const cellPalette = Uint8Array.from(pattern.cellPalette);
  let stitched = 0;
  for (let i = 0; i < cellPalette.length; i++) {
    const empty = i % 3 === 0;
    cellPalette[i] = empty ? EMPTY_CELL : 0;
    if (!empty) stitched++;
  }
  const color: PaletteColor = { index: 0, rgb: [180, 60, 90], symbol: "A", name: "Salmon - Dark", count: stitched };
  return { ...pattern, cellPalette, palette: [color] };
}

beforeAll(() => {
  installServerExportBackend();
});

afterAll(() => {
  setExportBackend(null);
});

describe("server export backend", () => {
  it("registers a font, so text has real width", () => {
    const families = registerExportFonts();
    expect(families.length).toBeGreaterThan(0);

    const { ctx } = serverExportBackend.createCanvas(10, 10);
    ctx.font = "13px Arial, 'Segoe UI', sans-serif";
    // Zero here is the failure this whole decision exists to prevent.
    expect(ctx.measureText("Salmon - Dark 3328").width).toBeGreaterThan(50);
  });

  it("renders a colour chart to a PNG the size the layout asked for", async () => {
    const canvas = renderPatternToCanvas(smallChart(), "color", { aidaCount: 14, sizeUnit: "cm", authorName: "" });
    expect(canvas.width).toBeGreaterThan(0);
    expect(canvas.height).toBeGreaterThan(0);

    const blob = await serverExportBackend.toPngBlob(canvas);
    const bytes = Buffer.from(await blob.arrayBuffer());
    expect(blob.type).toBe("image/png");
    // A real PNG, and its IHDR dimensions match the canvas rather than a default.
    expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(bytes.readUInt32BE(16)).toBe(canvas.width);
    expect(bytes.readUInt32BE(20)).toBe(canvas.height);
  });

  it("loads and tints the stitch texture for the realistic preview", async () => {
    const canvas = await renderStitchPreviewToCanvas(smallChart());
    const bytes = Buffer.from(await (await serverExportBackend.toPngBlob(canvas)).arrayBuffer());
    expect(bytes.readUInt32BE(16)).toBe(canvas.width);
    expect(bytes.length).toBeGreaterThan(100);
  });

  it("reads the PDF font bytes from disk as a real TrueType file", async () => {
    const bytes = await serverExportBackend.loadFontBytes("/fonts/DejaVuSans.ttf");
    expect(bytes.byteLength).toBeGreaterThan(100_000);
    // TrueType files start with the 0x00010000 sfnt version tag.
    expect(Buffer.from(bytes.subarray(0, 4)).readUInt32BE(0)).toBe(0x00010000);
  });
});
