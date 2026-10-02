import { describe, expect, it } from "vitest";
import { stitchPreviewPixels } from "@/lib/export/render";
import type { StitchPattern } from "@/lib/types";

/**
 * G-086: the realistic preview draws the chart's backstitch over the stitches, a plain coloured line a fifth of a cell wide.
 *
 * The same chart, cell size and probes as `rust/cs-export/tests/preview_backstitch.rs`, with solid tiles so the numbers do not depend
 * on a texture, and the same values: the page's renderer and the exporter that production runs draw the same line.
 */

const CELL = 20;
const COLORS: Array<[number, number, number]> = [
  [40, 90, 160],
  [220, 30, 30],
  [30, 200, 60],
];

function chart(withLines: boolean): StitchPattern {
  return {
    width: 10,
    height: 6,
    cellPalette: new Uint8Array(60),
    palette: COLORS.map((rgb, index) => ({ index, rgb, symbol: "ABC"[index], name: `T${index}`, count: 0 })),
    isLandscape: true,
    backstitch: withLines
      ? [
          { x1: 2, y1: 3, x2: 8, y2: 3, paletteIndex: 1 },
          { x1: 1, y1: 1, x2: 4, y2: 5, paletteIndex: 2 },
        ]
      : [],
  };
}

function strip(pattern: StitchPattern, y: number, h: number): Uint8ClampedArray {
  const pixels = COLORS.map((rgb) => Uint8ClampedArray.from({ length: CELL * CELL * 4 }, (_, i) => (i % 4 === 3 ? 255 : rgb[i % 4])));
  return stitchPreviewPixels(pattern, { cellSize: CELL, pixels, palette: pattern.palette, texture: "classic" }).getImageData(
    0,
    y,
    10 * CELL,
    h
  ).data;
}

const at = (data: Uint8ClampedArray, x: number, y: number, top = 0) =>
  Array.from(data.subarray(((y - top) * 10 * CELL + x) * 4, ((y - top) * 10 * CELL + x) * 4 + 4));

describe("the realistic preview and backstitch", () => {
  it("draws the same pixels the Rust exporter does", () => {
    const rows = strip(chart(true), 0, 6 * CELL);
    const probes: Array<[number, number, number[]]> = [
      [100, 57, [40, 90, 160, 255]],
      [100, 58, [220, 30, 30, 255]],
      [100, 60, [220, 30, 30, 255]],
      [50, 60, [30, 200, 60, 255]],
      [50, 67, [40, 90, 160, 255]],
      [60, 43, [40, 90, 160, 255]],
      [161, 60, [205, 35, 41, 255]],
    ];
    for (const [x, y, want] of probes) expect(at(rows, x, y), `pixel (${x}, ${y})`).toEqual(want);
  });

  it("gives the same pixels in strips cutting the lines as all at once, and none of it for a chart without backstitch", () => {
    const whole = strip(chart(true), 0, 6 * CELL);
    const parts: number[] = [];
    for (let y = 0; y < 6 * CELL; y += 17) parts.push(...strip(chart(true), y, Math.min(17, 6 * CELL - y)));
    expect(Array.from(whole)).toEqual(parts);
    const plain = strip(chart(false), 0, 6 * CELL);
    expect(at(plain, 100, 60)).toEqual([40, 90, 160, 255]);
  });
});
