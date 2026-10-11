import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { createBlankPattern } from "@/lib/editor/blank-pattern";
import { addColor, withCellPalette } from "@/lib/editor/pattern-edit";
import { STITCH_BACKSLASH as B, STITCH_SLASH as S, STITCH_WHOLE as W } from "@/lib/editor/stitch-kind";
import { HALF_STITCH_CUT, halfStitchMask, halfStitchPolygon, insideHalfStitch } from "@/lib/export/half-stitch-shape";
import { drawCell, drawChart } from "@/lib/editor/chart-render";
import { EMPTY_CELL, type StitchPattern } from "@/lib/types";

/** G-082 M3: a half stitch is its cell with two opposite corners cut away, 60 % of the side each way (D325). */

describe("the cut shape", () => {
  it("leaves a hexagon whose cuts are the top-left and bottom-right for '/', the other two for '\'", () => {
    const slash = halfStitchPolygon(S, 100);
    expect(slash).toEqual([
      [60, 0],
      [100, 0],
      [100, 40],
      [40, 100],
      [0, 100],
      [0, 60],
    ]);
    const back = halfStitchPolygon(B, 100);
    expect(back).toEqual([
      [0, 0],
      [40, 0],
      [100, 60],
      [100, 100],
      [60, 100],
      [0, 40],
    ]);
    expect(halfStitchPolygon(W, 100)).toEqual([]);
    expect(HALF_STITCH_CUT).toBe(0.6);
  });

  it("agrees with the polygon about which pixels of a 20-pixel cell are left", () => {
    // '/' : the top-left and bottom-right corners are gone, the other two stay.
    expect(insideHalfStitch(S, 20, 0, 0)).toBe(false);
    expect(insideHalfStitch(S, 20, 19, 19)).toBe(false);
    expect(insideHalfStitch(S, 20, 19, 0)).toBe(true);
    expect(insideHalfStitch(S, 20, 0, 19)).toBe(true);
    expect(insideHalfStitch(B, 20, 19, 0)).toBe(false);
    expect(insideHalfStitch(B, 20, 0, 19)).toBe(false);
    expect(insideHalfStitch(B, 20, 0, 0)).toBe(true);
    expect(insideHalfStitch(B, 20, 19, 19)).toBe(true);
    expect(insideHalfStitch(W, 20, 0, 0)).toBe(true);
    // The area left is the cell less two right triangles with legs of the cut: 1 - cut².
    let inside = 0;
    for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) if (insideHalfStitch(S, 100, x, y)) inside++;
    expect(inside / 10000).toBeCloseTo(1 - HALF_STITCH_CUT * HALF_STITCH_CUT, 1);
  });
});

function pixel(data: Uint8ClampedArray, width: number, x: number, y: number): [number, number, number] {
  const o = (y * width + x) * 4;
  return [data[o], data[o + 1], data[o + 2]];
}

function chart(kinds: number[]): StitchPattern {
  let base = createBlankPattern(10, 10);
  base = addColor(base, [200, 20, 20]);
  const empty = new Uint8Array(100).fill(EMPTY_CELL);
  const cells = empty.slice();
  const cellKind = new Uint8Array(100);
  kinds.forEach((kind, i) => {
    cells[i] = 0;
    cellKind[i] = kind;
  });
  return withCellPalette({ ...base, cellPalette: empty, cellKind: undefined }, cells, cellKind);
}

describe("drawn on a canvas", () => {
  const RED: [number, number, number] = [200, 20, 20];
  const GROUND: [number, number, number] = [250, 250, 240];

  it("fills the stitch where it is left and the empty colour where the corners are cut, for both kinds", () => {
    const size = 40;
    const pattern = chart([S, B, W]);
    const canvas = createCanvas(3 * size, size);
    const ctx = canvas.getContext("2d");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    drawChart(ctx as any, pattern, "color", size, { x0: 0, y0: 0, x1: 3, y1: 1 }, "rgb(250, 250, 240)");
    const { data } = ctx.getImageData(0, 0, 3 * size, size);
    const at = (cell: number, x: number, y: number) => pixel(data, 3 * size, cell * size + x, y);
    // '/' (cell 0): top-left corner cut, bottom-left and top-right kept, bottom-right cut.
    expect(at(0, 3, 3)).toEqual(GROUND);
    expect(at(0, 36, 36)).toEqual(GROUND);
    expect(at(0, 36, 5)).toEqual(RED);
    expect(at(0, 4, 35)).toEqual(RED);
    // '\' (cell 1): the other pair.
    expect(at(1, 36, 4)).toEqual(GROUND);
    expect(at(1, 3, 36)).toEqual(GROUND);
    expect(at(1, 5, 5)).toEqual(RED);
    expect(at(1, 35, 35)).toEqual(RED);
    // A whole stitch is the whole square.
    for (const [x, y] of [
      [3, 3],
      [36, 3],
      [3, 36],
      [36, 36],
    ])
      expect(at(2, x, y)).toEqual(RED);
  });

  it("redraws one cell in place with the kind it is given", () => {
    const size = 40;
    const pattern = chart([W]);
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext("2d");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    drawCell(ctx as any, pattern, "color", size, 0, 0, 0, "rgb(250, 250, 240)", S);
    const { data } = ctx.getImageData(0, 0, size, size);
    expect(pixel(data, size, 3, 3)).toEqual(GROUND);
    expect(pixel(data, size, 36, 5)).toEqual(RED);
  });
});

describe("the Stitched view", () => {
  it("cuts the stitch texture with the same corners, smooth at the edge", () => {
    const mask = halfStitchMask(S, 20);
    expect(mask[0]).toBe(0); // top-left pixel
    expect(mask[19 * 20 + 19]).toBe(0); // bottom-right
    expect(mask[19]).toBe(255); // top-right
    expect(mask[19 * 20]).toBe(255); // bottom-left
    expect(mask[10 * 20 + 10]).toBe(255);
    // Along the cut there are partly covered pixels.
    expect(Array.from(mask).some((v) => v > 0 && v < 255)).toBe(true);
    expect(halfStitchMask(S, 20)).toBe(mask); // cached
    // "\" is "/" mirrored left to right.
    const back = halfStitchMask(B, 20);
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) expect(back[y * 20 + x]).toBe(mask[y * 20 + (19 - x)]);
  });
});
