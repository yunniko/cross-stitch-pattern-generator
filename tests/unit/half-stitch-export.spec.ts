import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createBlankPattern } from "@/lib/editor/blank-pattern";
import { addColor, withCellPalette } from "@/lib/editor/pattern-edit";
import { STITCH_BACKSLASH as B, STITCH_SLASH as S, STITCH_WHOLE as W, threadStitches, wholeStitches } from "@/lib/editor/stitch-kind";
import { HALF_STITCH_CUT, halfStitchMask } from "@/lib/export/half-stitch-shape";
import { EMPTY_CELL, type StitchPattern } from "@/lib/types";

/** G-082 M4: half stitches in the legend rows, and the cut the screen shares with the Rust exporter. */

function chart(cells: number[], kinds: number[]): StitchPattern {
  let base = createBlankPattern(10, 10);
  base = addColor(base, [200, 20, 20]);
  base = addColor(base, [20, 20, 200]);
  const all = new Uint8Array(100).fill(EMPTY_CELL);
  const allKinds = new Uint8Array(100);
  cells.forEach((c, i) => {
    all[i] = c;
    allKinds[i] = kinds[i];
  });
  return withCellPalette({ ...base, cellPalette: all.slice(), cellKind: undefined }, all, allKinds);
}

describe("the legend rows", () => {
  const halves = chart([0, 0, 0, 1, 0], [W, S, B, S, S]);

  it("counts a half stitch as half a stitch of thread, and can show the chart with all whole", () => {
    expect(threadStitches(halves, 0)).toBe(1 + 2); // one whole and three halves: one whole stitch and two of thread
    expect(wholeStitches(halves).cellKind).toBeUndefined();
    expect(wholeStitches(halves).cellPalette).toBe(halves.cellPalette);
  });
});

describe("the Rust exporter agrees on the cut", () => {
  const rust = (file: string) => readFileSync(path.join(process.cwd(), "rust", "cs-export", "src", file), "utf8");

  it("has the same cut", () => {
    expect(HALF_STITCH_CUT).toBe(0.6);
    expect(rust("halfstitch.rs")).toContain("pub const HALF_STITCH_CUT: f64 = 0.6;");
  });

  it("has the mask sums the Rust test asserts", () => {
    const sum = (kind: number, size: number) => halfStitchMask(kind, size).reduce((a, b) => a + b, 0);
    expect([4, 10, 24].map((size) => sum(S, size))).toEqual([2646, 16698, 94194]);
    expect([4, 10, 24].map((size) => sum(B, size))).toEqual([2646, 16698, 94194]);
    expect(rust("halfstitch.rs")).toContain("(4usize, 2646u32), (10, 16698), (24, 94194)");
  });
});
