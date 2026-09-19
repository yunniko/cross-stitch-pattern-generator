import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createCanvas, setExportBackend } from "@/lib/export/canvas-backend";
import { drawChart, symbolStampsFor, type RenderMode } from "@/lib/export/render";
import { symbolsFor } from "@/lib/color/symbols";
import { installServerExportBackend } from "@/processor/export-backend";
import type { PaletteColor, RGB, StitchPattern } from "@/lib/types";

/**
 * G-047 M1 (D172): raster exports stamp each symbol from a tile drawn once per colour instead of calling `fillText` per
 * stitch. The Owner accepted a difference of at most 1 per byte (2026-09-19); a glyph clipped by too small a tile, or
 * drawn in the wrong place or colour, differs by far more. Every symbol the app can assign is drawn, on light and dark
 * fills, at the cell sizes the exports use (7 px is the 1000-stitch chart PNG, 32 px an A4 page at 300 dpi).
 */

process.env.EXPORT_ASSET_ROOT = path.join(__dirname, "..", "..", "public");

function everySymbolPattern(): StitchPattern {
  const symbols = symbolsFor(100);
  const palette: PaletteColor[] = symbols.map((symbol, i) => {
    const rgb: RGB = i % 2 === 0 ? [20 + (i % 7) * 10, 30, 60] : [230, 220 - (i % 5) * 10, 200];
    return { index: i, rgb, symbol, name: `Colour ${i}`, count: 0 };
  });
  const width = 25;
  const height = 12;
  const cellPalette = Uint8Array.from({ length: width * height }, (_, i) => (i * 37) % palette.length);
  for (const p of cellPalette) palette[p].count++;
  return { width, height, cellPalette, palette, isLandscape: true };
}

function draw(pattern: StitchPattern, mode: RenderMode, cellSize: number, stamped: boolean): Uint8ClampedArray {
  const { ctx } = createCanvas(pattern.width * cellSize + 20, pattern.height * cellSize + 20);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, pattern.width * cellSize + 20, pattern.height * cellSize + 20);
  ctx.translate(10, 10);
  drawChart(ctx, pattern, mode, cellSize, undefined, "#ffffff", "stroke", stamped ? symbolStampsFor(pattern.palette, mode, cellSize) : null);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return ctx.getImageData(0, 0, pattern.width * cellSize + 20, pattern.height * cellSize + 20).data;
}

beforeAll(() => {
  installServerExportBackend();
});

afterAll(() => {
  setExportBackend(null);
});

describe("symbol stamps", () => {
  it("draw every symbol within 1 of fillText, in both modes and at every export cell size", () => {
    const pattern = everySymbolPattern();
    for (const mode of ["color", "bw"] as const) {
      for (const cellSize of [6, 7, 12, 24, 32]) {
        const text = draw(pattern, mode, cellSize, false);
        const stamped = draw(pattern, mode, cellSize, true);
        let maxDelta = 0;
        let differing = 0;
        for (let i = 0; i < text.length; i++) {
          const d = Math.abs(text[i] - stamped[i]);
          if (d > 0) differing++;
          if (d > maxDelta) maxDelta = d;
        }
        expect(maxDelta, `${mode} at ${cellSize} px: largest byte difference (${differing} bytes differ)`).toBeLessThanOrEqual(1);
      }
    }
  });

  it("are not built below the symbol floor, and are reused for the same palette", () => {
    const pattern = everySymbolPattern();
    expect(symbolStampsFor(pattern.palette, "color", 5)).toBeNull();
    expect(symbolStampsFor(pattern.palette, "color", 12)).toBe(symbolStampsFor(pattern.palette, "color", 12));
    expect(symbolStampsFor(pattern.palette, "bw", 12)).not.toBe(symbolStampsFor(pattern.palette, "color", 12));
  });
});
