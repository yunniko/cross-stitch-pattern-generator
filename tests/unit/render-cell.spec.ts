import { describe, expect, it } from "vitest";
import { drawCell, drawChart } from "@/lib/render";
import { EMPTY_CELL, type PaletteColor, type StitchPattern } from "@/lib/types";
import { makeRecordingContext } from "./helpers/recording-context";

function makePattern(): StitchPattern {
  const palette: PaletteColor[] = [
    { index: 0, rgb: [255, 0, 0], symbol: "A", name: "Red", count: 3 },
    { index: 1, rgb: [0, 0, 40], symbol: "B", name: "Navy", count: 1 },
  ];
  return { width: 2, height: 2, cellPalette: Uint8Array.from([0, 0, 0, 1]), palette, isLandscape: true };
}

/** G-031 M2 (review B7): a single-cell redraw must leave the canvas exactly as a full `drawChart` would have at that cell. */
describe("drawCell", () => {
  it("fills, labels and re-outlines exactly the one cell, at its own position", () => {
    const ctx = makeRecordingContext();
    drawCell(ctx, makePattern(), "color", 20, 1, 0, 1);

    expect(ctx.rects).toEqual([{ x: 20, y: 0, w: 20, h: 20, fillStyle: "rgb(0, 0, 40)" }]);
    expect(ctx.texts).toEqual([{ text: "B", x: 30, y: 11, fillStyle: "#ffffff" }]); // dark fill -> white symbol
    // Four gridline segments bounding the cell: x=20, x=40, y=0, y=20.
    expect(ctx.lines).toHaveLength(4);
    expect(ctx.lines.map((l) => [l.from, l.to])).toEqual([
      [[20, 0], [20, 20]],
      [[40, 0], [40, 20]],
      [[20, 0], [40, 0]],
      [[20, 20], [40, 20]],
    ]);
  });

  it("uses the same gridline weights as the full chart for the cell's global row/column (every 5th/10th heavier)", () => {
    const full = makeRecordingContext();
    const big: StitchPattern = { ...makePattern(), width: 12, height: 12, cellPalette: new Uint8Array(144) };
    drawChart(full, big, "color", 24);
    const weightAt = (coord: number, vertical: boolean) => full.lines.find((l) => (vertical ? l.from[0] === coord && l.to[0] === coord : l.from[1] === coord && l.to[1] === coord))!.lineWidth;

    const one = makeRecordingContext();
    drawCell(one, big, "color", 24, 9, 4, 0); // right edge is column 10 (major), bottom edge is row 5 (medium)
    expect(one.lines.map((l) => l.lineWidth)).toEqual([weightAt(9 * 24, true), weightAt(10 * 24, true), weightAt(4 * 24, false), weightAt(5 * 24, false)]);
    expect(weightAt(10 * 24, true)).toBeGreaterThan(weightAt(9 * 24, true));
  });

  it("draws the empty-cell sentinel as the canvas color with no symbol", () => {
    const ctx = makeRecordingContext();
    drawCell(ctx, makePattern(), "color", 20, 0, 0, EMPTY_CELL, "#abcdef");
    expect(ctx.rects).toEqual([{ x: 0, y: 0, w: 20, h: 20, fillStyle: "#abcdef" }]);
    expect(ctx.texts).toEqual([]);
  });

  it("skips the symbol below the legibility floor, like drawChart", () => {
    const ctx = makeRecordingContext();
    drawCell(ctx, makePattern(), "bw", 4, 0, 0, 0);
    expect(ctx.rects).toHaveLength(1);
    expect(ctx.texts).toEqual([]);
  });
});
