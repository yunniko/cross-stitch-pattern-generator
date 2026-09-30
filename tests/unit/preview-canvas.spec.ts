import { describe, expect, it } from "vitest";
import { buildGround } from "@/lib/export/canvas-ground";
import { stitchPreviewPixels } from "@/lib/export/render";
import type { StitchTiles } from "@/lib/export/stitch-texture";
import { EMPTY_CELL, type StitchPattern } from "@/lib/types";

/**
 * The TypeScript reference of the exported preview's canvas (G-077 M2): the stitches are laid over the ground by their
 * alpha, and empty stitches show the ground. `rust/cs-export/src/preview.rs` is what production runs (see
 * `scripts/rust-canvas.ts`); this keeps the reference honest and pins the arithmetic.
 */

const CELL = 2;
// One colour, one 2 × 2 tile: an opaque red, a half-transparent blue, a clear pixel and an opaque green.
const TILES = {
  palette: [{ index: 0, rgb: [0, 0, 0], symbol: "A", name: "A", count: 1 }],
  texture: "classic",
  cellSize: CELL,
  pixels: [Uint8ClampedArray.of(255, 0, 0, 255, 0, 0, 255, 128, 9, 9, 9, 0, 0, 255, 0, 255)],
} as unknown as StitchTiles;
const PATTERN = { width: 2, height: 1, cellPalette: Uint8Array.of(0, EMPTY_CELL), palette: TILES.palette } as unknown as StitchPattern;

function pixel(rows: Uint8ClampedArray, x: number, y: number, width = 4) {
  return Array.from(rows.subarray((y * width + x) * 4, (y * width + x) * 4 + 4));
}

describe("the preview's ground", () => {
  it("is transparent under empty stitches when there is no canvas", () => {
    const { data } = stitchPreviewPixels(PATTERN, TILES).getImageData(0, 0, 4, 2);
    expect(pixel(data, 2, 0)).toEqual([0, 0, 0, 0]);
    expect(pixel(data, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixel(data, 1, 0)).toEqual([0, 0, 255, 128]);
  });

  it("is the canvas colour when the cloth is off, and lies under the stitches by their alpha", async () => {
    const ground = await buildGround({ color: "#336699", texture: "off" }, CELL);
    expect([ground.width, ground.height]).toEqual([1, 1]);
    const { data } = stitchPreviewPixels(PATTERN, TILES, ground).getImageData(0, 0, 4, 2);
    // Empty stitch: the plain colour, opaque.
    expect(pixel(data, 2, 0)).toEqual([51, 102, 153, 255]);
    expect(pixel(data, 3, 1)).toEqual([51, 102, 153, 255]);
    // Opaque stitch pixel: the stitch. Half-clear blue: halfway to the canvas. Clear: the canvas.
    expect(pixel(data, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixel(data, 1, 0)).toEqual([25, 51, 204, 255]);
    expect(pixel(data, 0, 1)).toEqual([51, 102, 153, 255]);
    expect(pixel(data, 1, 1)).toEqual([0, 255, 0, 255]);
  });

  it("makes every pixel opaque", async () => {
    const ground = await buildGround({ color: "#ffffff", texture: "off" }, CELL);
    const { data } = stitchPreviewPixels(PATTERN, TILES, ground).getImageData(0, 0, 4, 2);
    for (let i = 3; i < data.length; i += 4) expect(data[i]).toBe(255);
  });
});
