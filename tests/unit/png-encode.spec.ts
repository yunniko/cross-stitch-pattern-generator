import path from "node:path";
import { createCanvas, loadImage, type Canvas } from "@napi-rs/canvas";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setExportBackend } from "@/lib/export/canvas-backend";
import { calculateA4Layout } from "@/lib/export/a4-layout";
import { renderA4GridPage, renderA4LegendPage } from "@/lib/export/a4-render";
import { renderPatternToCanvas } from "@/lib/export/render";
import { renderStitchPreviewToCanvas } from "./reference/render-pre-g036";
import { buildPattern } from "@/lib/pipeline/pattern";
import { installServerExportBackend } from "@/processor/export-backend";
import { encodePng, type PixelSource } from "@/processor/png-encode";
import type { StitchPattern } from "@/lib/types";
import { makePhotoLikeBuffer } from "./helpers/fixtures";

/**
 * G-047 M1 (D171): the server writes its own PNGs. The file differs from the canvas library's; the pixels must not.
 * Each export kind is encoded both ways and both files are decoded by the same decoder, then compared byte for byte.
 */

process.env.EXPORT_ASSET_ROOT = path.join(__dirname, "..", "..", "public");

type NapiCanvas = Canvas;

async function decode(png: Uint8Array): Promise<Uint8ClampedArray> {
  const image = await loadImage(Buffer.from(png));
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, image.width, image.height).data;
}

/** Encodes `canvas` both ways and returns the colour type ours chose, after proving the decoded pixels equal. */
async function expectSamePixels(canvas: NapiCanvas): Promise<number> {
  const ours = await encodePng(canvas.getContext("2d") as unknown as PixelSource, canvas.width, canvas.height);
  const theirs = await canvas.encode("png");
  const [a, b] = await Promise.all([decode(ours), decode(theirs)]);
  expect(a.length).toBe(b.length);
  let differing = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) differing++;
  expect(differing, "decoded bytes that differ from the library encoder's").toBe(0);
  return ours[25];
}

let pattern: StitchPattern;

beforeAll(() => {
  installServerExportBackend();
  pattern = buildPattern(makePhotoLikeBuffer(180, 120), { longerSideStitches: 120, colorCount: 24 });
});

afterAll(() => {
  setExportBackend(null);
});

describe("the server's PNG writer", () => {
  it("writes an A4 grid page and the legend page with the library's exact pixels, as RGB", async () => {
    const layout = calculateA4Layout(pattern.width, pattern.height, { overlapCells: 5 });
    const page = renderA4GridPage(pattern, "color", layout, layout.pages[layout.pages.length - 1], layout.pages.length - 1, layout.pages.length);
    expect(await expectSamePixels(page as unknown as NapiCanvas)).toBe(2);
    expect(await expectSamePixels(renderA4LegendPage(pattern, layout) as unknown as NapiCanvas)).toBe(2);
  }, 60_000);

  it("writes the colour and black-and-white chart PNGs with the library's exact pixels", async () => {
    for (const mode of ["color", "bw"] as const) {
      const canvas = renderPatternToCanvas(pattern, mode, { aidaCount: 14, sizeUnit: "cm" });
      expect(await expectSamePixels(canvas as unknown as NapiCanvas)).toBe(2);
    }
  }, 60_000);

  it("keeps the realistic preview's soft transparent edges, as RGBA", async () => {
    const canvas = await renderStitchPreviewToCanvas(pattern, { cellSize: 6 });
    expect(await expectSamePixels(canvas as unknown as NapiCanvas)).toBe(6);
  }, 60_000);

  it("packs rows whose width is not a multiple of four pixels, across several strips", async () => {
    for (const width of [1, 2, 3, 5, 37]) {
      const canvas = createCanvas(width, 150);
      const ctx = canvas.getContext("2d");
      for (let y = 0; y < 150; y += 3) {
        ctx.fillStyle = `rgb(${(y * 7) % 256}, ${(y * 13 + width) % 256}, ${(y * 29) % 256})`;
        ctx.fillRect(0, y, width, 3);
      }
      ctx.fillStyle = "#101010";
      ctx.fillRect(width - 1, 0, 1, 150);
      expect(await expectSamePixels(canvas)).toBe(2);
    }
  });

  it("restarts as RGBA when the first translucent pixel comes after the first strip of rows", async () => {
    const canvas = createCanvas(37, 203);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#3a7bd5";
    ctx.fillRect(0, 0, 37, 203);
    ctx.clearRect(20, 180, 5, 3);
    ctx.fillStyle = "rgba(200, 40, 40, 0.5)";
    ctx.fillRect(3, 190, 9, 9);
    expect(await expectSamePixels(canvas)).toBe(6);
  });
});
