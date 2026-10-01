import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createBlankPattern } from "@/lib/editor/blank-pattern";
import { addColor, withCellPalette } from "@/lib/editor/pattern-edit";
import {
  kindWord,
  legendEntries,
  STITCH_BACKSLASH as B,
  STITCH_SLASH as S,
  STITCH_WHOLE as W,
  threadStitches,
  wholeStitches,
} from "@/lib/editor/stitch-kind";
import { calculateA4Layout } from "@/lib/export/a4-layout";
import { buildDetailRows, planInfoPages } from "@/lib/export/a4-render";
import { HALF_STITCH_CUT, halfStitchMask } from "@/lib/export/half-stitch-shape";
import { buildPatternKeeperPdf } from "@/lib/export/pattern-keeper-pdf";
import { legendCanvasExtent, LEGEND_COLUMN_WIDTH_WITH_HALVES } from "@/lib/export/render";
import { EMPTY_CELL, type StitchPattern } from "@/lib/types";

/** G-082 M4: half stitches in the legend, the key and the exports that cannot show them. */

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

  it("is a row per thread without half stitches, and a row per type and thread with them", () => {
    const plain = chart([0, 0, 1], [W, W, W]);
    expect(legendEntries(plain).map((e) => [e.colorIndex, e.kind, e.count])).toEqual([
      [0, W, 2],
      [1, W, 1],
    ]);
    expect(legendEntries(halves).map((e) => [e.colorIndex, e.kind, e.count])).toEqual([
      [0, W, 1],
      [0, S, 2],
      [0, B, 1],
      [1, S, 1],
    ]);
  });

  it("says the type in words, counts a half stitch as half a stitch of thread, and can show the chart with all whole", () => {
    expect([W, S, B].map(kindWord)).toEqual(["whole", "half /", "half \\"]);
    expect(threadStitches(halves, 0)).toBe(1 + 2); // one whole and three halves: one whole stitch and two of thread
    expect(wholeStitches(halves).cellKind).toBeUndefined();
    expect(wholeStitches(halves).cellPalette).toBe(halves.cellPalette);
  });

  it("widens the legend column when there are half stitches", () => {
    expect(LEGEND_COLUMN_WIDTH_WITH_HALVES).toBeGreaterThan(170);
    const wide = legendCanvasExtent({ ...halves, isLandscape: false }, 400, 400);
    const narrow = legendCanvasExtent({ ...halves, isLandscape: false, cellKind: undefined }, 400, 400);
    expect(wide.extraWidth).toBeGreaterThan(narrow.extraWidth);
  });
});

describe("the A4 colour key", () => {
  const layout = calculateA4Layout(10, 10, { dpi: 72 });
  const options = { authorName: "", aidaCount: 14, sizeUnit: "cm" as const };

  it("has a row for every combination, a Type column and a Half stitches line, only when the chart has half stitches", () => {
    const halves = chart([0, 0, 1], [W, S, B]);
    const plain = chart([0, 0, 1], [W, W, W]);
    expect(planInfoPages(halves, layout, options).totalColors).toBe(3);
    expect(planInfoPages(plain, layout, options).totalColors).toBe(2);
    expect(planInfoPages(halves, layout, options).cols.typeW).toBeGreaterThan(0);
    expect(planInfoPages(plain, layout, options).cols.typeW).toBe(0);
    // The count counts both kinds together; two lines say how it divides.
    const rows = buildDetailRows(halves, 14, "cm");
    expect(rows.find(([k]) => k === "Stitch count")?.[1]).toContain("3 stitches");
    expect(rows.find(([k]) => k === "Full stitches")?.[1]).toBe("1");
    expect(rows.find(([k]) => k === "Half stitches")?.[1]).toBe("2");
    expect(buildDetailRows(plain, 14, "cm").some(([k]) => k === "Half stitches" || k === "Full stitches")).toBe(false);
  });
});

describe("Pattern Keeper", () => {
  it("is given every half stitch as a whole one: the PDF of a chart with half stitches is that of the same chart whole", async () => {
    const font = readFileSync(path.join(process.cwd(), "public", "fonts", "DejaVuSans.ttf"));
    const halves = chart([0, 0, 1, 1], [S, B, S, W]);
    const whole = chart([0, 0, 1, 1], [W, W, W, W]);
    const a = await buildPatternKeeperPdf(halves, "color", new Uint8Array(font), { retainPageOperators: true });
    const b = await buildPatternKeeperPdf(whole, "color", new Uint8Array(font), { retainPageOperators: true });
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });
});

describe("the TypeScript and the Rust exporter agree on the cut", () => {
  const rust = (file: string) => readFileSync(path.join(process.cwd(), "rust", "cs-export", "src", file), "utf8");

  it("has the same cut and legend column width", () => {
    expect(HALF_STITCH_CUT).toBe(0.5);
    expect(rust("halfstitch.rs")).toContain("pub const HALF_STITCH_CUT: f64 = 0.5;");
    expect(rust("render.rs")).toContain(`const LEGEND_COLUMN_WIDTH_WITH_HALVES: f64 = ${LEGEND_COLUMN_WIDTH_WITH_HALVES}.0;`);
  });

  it("has the mask sums the Rust test asserts", () => {
    const sum = (kind: number, size: number) => halfStitchMask(kind, size).reduce((a, b) => a + b, 0);
    expect([4, 10, 24].map((size) => sum(S, size))).toEqual([3186, 19440, 110916]);
    expect([4, 10, 24].map((size) => sum(B, size))).toEqual([3186, 19440, 110916]);
    expect(rust("halfstitch.rs")).toContain("(4usize, 3186u32), (10, 19440), (24, 110916)");
  });
});
