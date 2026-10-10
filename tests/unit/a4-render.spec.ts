import { describe, expect, it } from "vitest";
import { buildDetailRows, computeKeyColumns, infoPageTitle, overlapSidesForPage } from "@/lib/export/a4-render";
import { calculateA4Layout } from "@/lib/export/a4-layout";
import { EMPTY_CELL, type PaletteColor, type RGB, type StitchPattern } from "@/lib/types";

function makePattern(width: number, height: number, cellPalette: number[], colors: RGB[]): StitchPattern {
  const counts = new Array(colors.length).fill(0);
  for (const i of cellPalette) if (i !== EMPTY_CELL) counts[i]++;
  const palette: PaletteColor[] = colors.map((rgb, i) => ({
    index: i,
    rgb,
    symbol: String(i),
    name: `Color ${i}`,
    count: counts[i],
  }));
  return { width, height, cellPalette: Uint8Array.from(cellPalette), palette, isLandscape: width >= height };
}

describe("overlapSidesForPage", () => {
  it("marks no sides when overlap is 0, regardless of position", () => {
    const layout = calculateA4Layout(300, 300, { overlapCells: 0 });
    expect(layout.pages.length).toBeGreaterThan(1);
    for (const page of layout.pages) {
      expect(overlapSidesForPage(page, layout)).toEqual({ left: false, top: false, right: false, bottom: false });
    }
  });

  it("marks no sides for a single-page pattern even with overlap configured", () => {
    const layout = calculateA4Layout(10, 10, { overlapCells: 5 });
    expect(layout.pages).toHaveLength(1);
    expect(overlapSidesForPage(layout.pages[0], layout)).toEqual({ left: false, top: false, right: false, bottom: false });
  });

  it("the first page in a multi-column row has a right overlap but no left overlap", () => {
    const layout = calculateA4Layout(1000, 10, { overlapCells: 5, orientation: "portrait" });
    expect(layout.columns).toBeGreaterThan(1);
    const firstPage = layout.pages[0];
    expect(firstPage.column).toBe(0);
    const sides = overlapSidesForPage(firstPage, layout);
    expect(sides.left).toBe(false);
    expect(sides.right).toBe(true);
  });

  it("the last page in a multi-column row has a left overlap but no right overlap", () => {
    const layout = calculateA4Layout(1000, 10, { overlapCells: 5, orientation: "portrait" });
    const lastPage = layout.pages[layout.pages.length - 1];
    expect(lastPage.column).toBe(layout.columns - 1);
    const sides = overlapSidesForPage(lastPage, layout);
    expect(sides.left).toBe(true);
    expect(sides.right).toBe(false);
  });

  it("an interior page (not first or last) has overlap on both left and right", () => {
    const layout = calculateA4Layout(1000, 10, { overlapCells: 5, orientation: "portrait" });
    expect(layout.columns).toBeGreaterThan(2);
    const interiorPage = layout.pages.find((p) => p.column > 0 && p.column < layout.columns - 1);
    expect(interiorPage).toBeDefined();
    const sides = overlapSidesForPage(interiorPage!, layout);
    expect(sides.left).toBe(true);
    expect(sides.right).toBe(true);
  });

  it("applies the same first/interior/last logic independently on the row axis", () => {
    const layout = calculateA4Layout(10, 1000, { overlapCells: 5, orientation: "portrait" });
    expect(layout.rows).toBeGreaterThan(1);
    const firstRowPage = layout.pages.find((p) => p.row === 0)!;
    const lastRowPage = layout.pages.find((p) => p.row === layout.rows - 1)!;
    expect(overlapSidesForPage(firstRowPage, layout)).toMatchObject({ top: false, bottom: true });
    expect(overlapSidesForPage(lastRowPage, layout)).toMatchObject({ top: true, bottom: false });
  });
});

describe("infoPageTitle (G-016)", () => {
  it("combines pattern name and author when both are present", () => {
    expect(infoPageTitle("My Cat", "Julie")).toBe("My Cat by Julie");
  });

  it("falls back to a generic name when only the author is given", () => {
    expect(infoPageTitle(undefined, "Julie")).toBe("Cross stitch pattern by Julie");
    expect(infoPageTitle("   ", "Julie")).toBe("Cross stitch pattern by Julie");
  });

  it("uses just the pattern name when there's no author", () => {
    expect(infoPageTitle("My Cat", "")).toBe("My Cat");
    expect(infoPageTitle("My Cat", "   ")).toBe("My Cat");
  });

  it("falls back to a fully generic title when neither is given", () => {
    expect(infoPageTitle(undefined, "")).toBe("Cross stitch pattern");
    expect(infoPageTitle("  ", "  ")).toBe("Cross stitch pattern");
  });
});

describe("buildDetailRows (G-016)", () => {
  it("includes stitch count, finished size (both units), fabric, and color count, but no Thread row for a non-DMC pattern", () => {
    const pattern = makePattern(140, 140, new Array(140 * 140).fill(0), [[0, 0, 0]]);
    const rows = buildDetailRows(pattern, 14, "in");
    const byLabel = Object.fromEntries(rows);
    expect(byLabel["Stitch count"]).toBe("140 × 140 (19,600 stitches)");
    expect(byLabel["Finished size"]).toContain("10.0 in");
    expect(byLabel["Finished size"]).toContain("25.4 cm");
    expect(byLabel["Fabric"]).toBe("14-count Aida");
    expect(byLabel["Thread"]).toBeUndefined();
    expect(byLabel["Color count"]).toBe("1 color");
  });

  it("counts only filled stitches, keeping the canvas size and the finished size it gives (D120)", () => {
    const cells = new Array(140 * 140).fill(0);
    for (let i = 0; i < 100; i++) cells[i] = EMPTY_CELL;
    const byLabel = Object.fromEntries(buildDetailRows(makePattern(140, 140, cells, [[0, 0, 0]]), 14, "in"));
    expect(byLabel["Stitch count"]).toBe("140 × 140 (19,500 stitches)");
    expect(byLabel["Finished size"]).toContain("10.0 × 10.0 in");
    const single = new Array(4).fill(EMPTY_CELL);
    single[0] = 0;
    expect(Object.fromEntries(buildDetailRows(makePattern(2, 2, single, [[0, 0, 0]]), 14, "in"))["Stitch count"]).toBe("2 × 2 (1 stitch)");
  });

  it("shows the secondary unit as cm-in-parens when the primary unit is cm, and vice versa", () => {
    const pattern = makePattern(140, 140, [0], [[0, 0, 0]]);
    const inFirst = buildDetailRows(pattern, 14, "in").find(([label]) => label === "Finished size")![1];
    const cmFirst = buildDetailRows(pattern, 14, "cm").find(([label]) => label === "Finished size")![1];
    expect(inFirst.indexOf("in")).toBeLessThan(inFirst.indexOf("cm"));
    expect(cmFirst.indexOf("cm")).toBeLessThan(cmFirst.indexOf("in"));
  });

  it("names in its Thread row the systems the threads are of, not the one the chart was generated in (G-131, D396)", () => {
    const base = {
      ...makePattern(
        10,
        10,
        [0, 1, 2],
        [
          [0, 0, 0],
          [9, 9, 9],
          [5, 5, 5],
        ]
      ),
      threadBrand: "dmc" as const,
    };
    expect(Object.fromEntries(buildDetailRows(base, 14, "in"))["Thread"]).toBeUndefined();
    const sources = [{ brand: "anchor", code: "403" }, undefined, { brand: "dmc", code: "X-77" }] as const;
    const mixed = { ...base, palette: base.palette.map((color, i) => ({ ...color, source: sources[i] })) };
    expect(Object.fromEntries(buildDetailRows(mixed, 14, "in"))["Thread"]).toBe("DMC, Anchor");
  });
});

describe("computeKeyColumns (G-016)", () => {
  it("has its System and Number columns in every chart (G-131, D396)", () => {
    const cols = computeKeyColumns(2000);
    expect(cols.systemW).toBeGreaterThan(0);
    expect(cols.codeW).toBeGreaterThan(0);
    expect(cols.codeX).toBe(cols.systemX + cols.systemW);
  });

  it("never lets columns exceed the printable width", () => {
    for (const hasType of [true, false]) {
      const printableWidthPx = 2200;
      const cols = computeKeyColumns(printableWidthPx, undefined, hasType);
      expect(cols.totalWidth).toBeLessThanOrEqual(printableWidthPx + 1); // rounding
    }
  });
});
