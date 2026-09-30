import { readFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { createBlankPattern } from "@/lib/editor/blank-pattern";
import { CANVAS_TEXTURES } from "@/lib/export/canvas-texture-catalog";
import type { ExportCanvas } from "@/lib/export/canvas-texture-catalog";
import type { ExportJobPayload } from "@/processor/job-protocol";
import { exportWithRust } from "@/processor/rust-jobs";
import { EMPTY_CELL, type StitchPattern } from "@/lib/types";
import { pixelAt, readPng } from "../tests/unit/helpers/png-read";

/**
 * G-077 M2: the exported realistic preview sits on the chosen canvas, through the real binary. Every pixel is opaque
 * with a canvas, empty stitches show the canvas colour (cloth off) or the cloth multiplied with it, the cloth repeats
 * once per cell, and a stitch is laid over it. Without a canvas the ground stays transparent, as before.
 */

process.env.CS_JOB_BINARY ??= path.resolve(
  __dirname,
  "..",
  "rust",
  "target",
  "release",
  process.platform === "win32" ? "cs-job.exe" : "cs-job"
);

const NO_SYMMETRY = { vertical: false, horizontal: false, diagonal: false, antidiagonal: false };

/** 12 × 10: the left half filled with one thread, the right half empty. */
function chart(): StitchPattern {
  const blank = createBlankPattern(12, 10);
  const cellPalette = Uint8Array.from(blank.cellPalette, (_, i) => (i % 12 < 6 ? 0 : EMPTY_CELL));
  return { ...blank, cellPalette, palette: [{ index: 0, rgb: [180, 60, 90], symbol: "A", name: "Salmon", count: 60 }] };
}

async function preview(canvas: ExportCanvas | undefined) {
  const payload = {
    kind: "png-realistic",
    pattern: chart(),
    baseName: "t",
    aidaCount: 14,
    sizeUnit: "cm",
    authorName: "",
    overlapCells: 5,
    canvas,
  } as unknown as ExportJobPayload;
  const { bytes } = await exportWithRust(payload, NO_SYMMETRY, () => {});
  const png = readPng(bytes);
  return { png, cell: png.width / 12 };
}

describe("the realistic preview export and the canvas", () => {
  it("keeps a transparent ground without a canvas", async () => {
    const { png, cell } = await preview(undefined);
    expect(pixelAt(png, cell * 9, cell * 5)[3]).toBe(0);
    expect(pixelAt(png, cell * 2, cell * 5)[3]).toBeGreaterThan(0);
  });

  it("carries the plain canvas colour, opaque, when the cloth is off", async () => {
    const { png, cell } = await preview({ color: "#336699", texture: "off" });
    for (let i = 3; i < png.rgba.length; i += 4) expect(png.rgba[i]).toBe(255);
    expect(pixelAt(png, cell * 9, cell * 5)).toEqual([51, 102, 153, 255]);
    expect(pixelAt(png, cell * 11 + 1, 2)).toEqual([51, 102, 153, 255]);
  });

  it("multiplies each cloth with the colour: white keeps the cloth's own light greys, a colour tints them", async () => {
    for (const { id } of CANVAS_TEXTURES.filter((t) => t.columns === 1 && t.rows === 1)) {
      const white = (await preview({ color: "#ffffff", texture: id })).png;
      const tinted = (await preview({ color: "#336699", texture: id })).png;
      const cell = white.width / 12;
      const greys = new Set<number>();
      for (let y = 0; y < cell; y++) for (let x = 0; x < cell; x++) greys.add(pixelAt(white, cell * 8 + x, cell * 4 + y)[0]);
      expect(greys.size, `${id} shows a weave`).toBeGreaterThan(8);
      const [r, g, b, a] = pixelAt(white, cell * 8 + 3, cell * 4 + 3);
      const [tr, tg, tb] = pixelAt(tinted, cell * 8 + 3, cell * 4 + 3);
      expect(a).toBe(255);
      expect(Math.abs(tr - Math.round((51 * r) / 255))).toBeLessThanOrEqual(1);
      expect(Math.abs(tg - Math.round((102 * g) / 255))).toBeLessThanOrEqual(1);
      expect(Math.abs(tb - Math.round((153 * b) / 255))).toBeLessThanOrEqual(1);
      // One tile per cell: the same pixel of the next empty cell is the same.
      expect(pixelAt(white, cell * 8 + 3, cell * 4 + 3)).toEqual(pixelAt(white, cell * 9 + 3, cell * 5 + 3));
    }
  });

  it("draws a cloth that spans many cells across the chart, and lays a stitch over the canvas", async () => {
    const natural = (await preview({ color: "#ffffff", texture: "natural" })).png;
    const cell = natural.width / 12;
    expect(pixelAt(natural, cell * 8 + 3, cell * 4 + 3)).not.toEqual(pixelAt(natural, cell * 9 + 3, cell * 5 + 3));
    const flat = (await preview({ color: "#ffffff", texture: "off" })).png;
    const plain = (await preview(undefined)).png;
    // An opaque stitch pixel is the same over any canvas, and as it was with no canvas.
    const centre = pixelAt(plain, cell * 2 + Math.floor(cell / 2), cell * 5 + Math.floor(cell / 2));
    if (centre[3] === 255) expect(pixelAt(flat, cell * 2 + Math.floor(cell / 2), cell * 5 + Math.floor(cell / 2))).toEqual(centre);
  });

  it("puts the canvas into the preview inside Export all as well", async () => {
    const payload = {
      kind: "all",
      pattern: chart(),
      baseName: "t",
      aidaCount: 14,
      sizeUnit: "cm",
      authorName: "",
      overlapCells: 5,
      canvas: { color: "#336699", texture: "off" },
    } as unknown as ExportJobPayload;
    const { bytes } = await exportWithRust(payload, NO_SYMMETRY, () => {});
    const zip = await JSZip.loadAsync(bytes);
    const png = readPng(await zip.file("t_preview.png")!.async("uint8array"));
    const cell = png.width / 12;
    for (let i = 3; i < png.rgba.length; i += 4) expect(png.rgba[i]).toBe(255);
    expect(pixelAt(png, cell * 9, cell * 5)).toEqual([51, 102, 153, 255]);
  });

  it("repeats the counted canvas every 8 cells across and 10 down, not every cell or every square of cells", async () => {
    const blank = createBlankPattern(20, 22);
    const payload = {
      kind: "png-realistic",
      pattern: { ...blank, palette: [{ index: 0, rgb: [180, 60, 90], symbol: "A", name: "Salmon", count: 1 }] },
      baseName: "t",
      aidaCount: 14,
      sizeUnit: "cm",
      authorName: "",
      overlapCells: 5,
      canvas: { color: "#ffffff", texture: "counted" },
    } as unknown as ExportJobPayload;
    const { png } = { png: readPng((await exportWithRust(payload, NO_SYMMETRY, () => {})).bytes) };
    const cell = png.width / 20;
    const at = (x: number, y: number) => pixelAt(png, x, y);
    for (const [x, y] of [
      [5, 7],
      [cell * 2 + 9, cell + 4],
    ]) {
      expect(at(x + 8 * cell, y)).toEqual(at(x, y));
      expect(at(x, y + 10 * cell)).toEqual(at(x, y));
      expect(at(x + 3 * cell, y)).not.toEqual(at(x, y));
    }
  });

  it("holds the same cloths, with the same columns and rows per tile, as the catalog the page uses", () => {
    const source = readFileSync(path.resolve(__dirname, "..", "rust", "cs-export", "src", "preview.rs"), "utf8");
    const block = source.slice(source.indexOf("const CANVAS_TEXTURES"), source.indexOf("];", source.indexOf("const CANVAS_TEXTURES")));
    const rows = [
      ...block.matchAll(
        /"([a-z-]+)",\s*include_bytes!\("[^"]*canvas-texture-([a-z-]+)\.png"\),\s*(\d+),\s*(\d+),\s*([\d.]+),\s*([\d.]+),/g
      ),
    ].map((m) => ({
      id: m[1],
      file: m[2],
      columns: Number(m[3]),
      rows: Number(m[4]),
      offsetX: Number(m[5]),
      offsetY: Number(m[6]),
    }));
    expect(rows).toEqual(
      CANVAS_TEXTURES.map(({ id, columns, rows, offsetX, offsetY }) => ({ id, file: id, columns, rows, offsetX, offsetY }))
    );
  });
});
