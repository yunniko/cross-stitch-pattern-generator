import path from "node:path";
import { createCanvas, loadImage, type Canvas } from "@napi-rs/canvas";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setExportBackend } from "@/lib/export/canvas-backend";
import { renderStitchPreviewPng } from "@/lib/export/render";
import { buildPattern } from "@/lib/pipeline/pattern";
import { installServerExportBackend, serverExportBackend } from "@/processor/export-backend";
import { EMPTY_CELL, type StitchPattern } from "@/lib/types";
import { makePhotoLikeBuffer } from "./helpers/fixtures";
import { renderStitchPreviewToCanvas } from "./reference/render-pre-g036";

/**
 * G-047 M2 (D173): the realistic preview PNG is streamed from per-colour tiles instead of drawn onto one canvas the
 * size of the whole image. The frozen canvas renderer is the reference; both images are decoded by the same decoder.
 * The canvas library scales a texture into a small tile a little differently than into a big canvas, by at most 1 in a
 * few texels of each stitch (under 0.01 % of bytes), which the Owner accepted (2026-09-19). A misplaced, clipped or
 * wrongly tinted tile, a lost transparent stitch or a strip seam differs by far more.
 */

process.env.EXPORT_ASSET_ROOT = path.join(__dirname, "..", "..", "public");

async function decode(png: Uint8Array): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const image = await loadImage(Buffer.from(png));
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  return { width: image.width, height: image.height, data: ctx.getImageData(0, 0, image.width, image.height).data };
}

async function expectSameAsCanvasRenderer(pattern: StitchPattern, cellSize?: number): Promise<void> {
  const options = cellSize === undefined ? {} : { cellSize };
  const reference = (await renderStitchPreviewToCanvas(pattern, options)) as unknown as Canvas;
  const expected = await decode(await reference.encode("png"));
  const streamed = await decode(new Uint8Array(await (await renderStitchPreviewPng(pattern, options)).arrayBuffer()));
  expect([streamed.width, streamed.height]).toEqual([expected.width, expected.height]);
  let differing = 0;
  let maxDelta = 0;
  for (let i = 0; i < expected.data.length; i++) {
    const d = Math.abs(expected.data[i] - streamed.data[i]);
    if (d > 0) differing++;
    if (d > maxDelta) maxDelta = d;
  }
  expect(maxDelta, `largest byte difference at ${expected.width}x${expected.height}`).toBeLessThanOrEqual(1);
  expect(differing / expected.data.length, "share of bytes that differ").toBeLessThan(0.001);
}

/** A generated chart with scattered empty stitches, so transparency meets texture edges. */
function chartWithHoles(stitches: number): StitchPattern {
  const pattern = buildPattern(makePhotoLikeBuffer(Math.round(stitches * 1.5), stitches), { longerSideStitches: stitches, colorCount: 20 });
  const cellPalette = pattern.cellPalette.slice();
  for (let i = 0; i < cellPalette.length; i++) if (i % 11 === 0 || (i % pattern.width) % 17 === 3) cellPalette[i] = EMPTY_CELL;
  return { ...pattern, cellPalette };
}

beforeAll(() => {
  installServerExportBackend();
});

afterAll(() => {
  setExportBackend(null);
});

describe("the streamed realistic preview", () => {
  it("matches the canvas renderer within 1 at the default, a mid and the smallest cell size", async () => {
    const pattern = chartWithHoles(60);
    await expectSameAsCanvasRenderer(pattern);
    // 7 px: stitch rows straddle the encoder's 64-row strips at uneven offsets.
    await expectSameAsCanvasRenderer(pattern, 7);
    await expectSameAsCanvasRenderer(pattern, 4);
  }, 120_000);

  it("matches it the same way where the environment cannot stream and assembles a canvas instead", async () => {
    const { pixelsToPngBlob: _streaming, ...withoutStreaming } = serverExportBackend;
    void _streaming;
    setExportBackend(withoutStreaming);
    try {
      await expectSameAsCanvasRenderer(chartWithHoles(40), 9);
    } finally {
      installServerExportBackend();
    }
  }, 120_000);
});
