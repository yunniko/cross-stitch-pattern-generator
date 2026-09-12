import { describe, expect, it } from "vitest";
import { buildDetailRows, computeKeyColumns, infoPageTitle, overlapSidesForPage, splitThreadCodeName } from "@/lib/a4-render";
import { calculateA4Layout } from "@/lib/a4-layout";
import type { PaletteColor, RGB, StitchPattern } from "@/lib/types";

function makePattern(width: number, height: number, cellPalette: number[], colors: RGB[]): StitchPattern {
  const counts = new Array(colors.length).fill(0);
  for (const i of cellPalette) counts[i]++;
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

describe("splitThreadCodeName (G-016)", () => {
  it("splits a 'CODE - Name' string into its parts", () => {
    expect(splitThreadCodeName("310 - Black")).toEqual({ code: "310", name: "Black" });
  });

  it("only splits on the first ' - ', since a DMC name can itself contain one", () => {
    expect(splitThreadCodeName("347 - Salmon - Very Dark")).toEqual({ code: "347", name: "Salmon - Very Dark" });
  });

  it("returns the whole string as the code, with an empty name, when there's no separator (G-029 M2: this is Cosmo's real shape -- a bare code, no descriptive name)", () => {
    expect(splitThreadCodeName("352")).toEqual({ code: "352", name: "" });
  });
});

describe("buildDetailRows (G-016)", () => {
  it("includes stitch count, finished size (both units), fabric, and color count, but no Thread row for a non-DMC pattern", () => {
    const pattern = makePattern(140, 140, [0], [[0, 0, 0]]);
    const rows = buildDetailRows(pattern, 14, "in");
    const byLabel = Object.fromEntries(rows);
    expect(byLabel["Stitch count"]).toBe("140 × 140 (19600 total)");
    expect(byLabel["Finished size"]).toContain("10.0 in");
    expect(byLabel["Finished size"]).toContain("25.4 cm");
    expect(byLabel["Fabric"]).toBe("14-count Aida");
    expect(byLabel["Thread"]).toBeUndefined();
    expect(byLabel["Color count"]).toBe("1 colors");
  });

  it("shows the secondary unit as cm-in-parens when the primary unit is cm, and vice versa", () => {
    const pattern = makePattern(140, 140, [0], [[0, 0, 0]]);
    const inFirst = buildDetailRows(pattern, 14, "in").find(([label]) => label === "Finished size")![1];
    const cmFirst = buildDetailRows(pattern, 14, "cm").find(([label]) => label === "Finished size")![1];
    expect(inFirst.indexOf("in")).toBeLessThan(inFirst.indexOf("cm"));
    expect(cmFirst.indexOf("cm")).toBeLessThan(cmFirst.indexOf("in"));
  });

  it("includes a 'Thread: DMC' row only when the pattern is brand-matched", () => {
    const pattern = { ...makePattern(10, 10, [0], [[0, 0, 0]]), threadBrand: "dmc" as const };
    const rows = buildDetailRows(pattern, 14, "in");
    expect(Object.fromEntries(rows)["Thread"]).toBe("DMC");
  });

  it("includes a 'Thread: Cosmo' row for a Cosmo-matched pattern (G-029 M2)", () => {
    const pattern = { ...makePattern(10, 10, [0], [[0, 0, 0]]), threadBrand: "cosmo" as const };
    const rows = buildDetailRows(pattern, 14, "in");
    expect(Object.fromEntries(rows)["Thread"]).toBe("Cosmo");
  });

  it("includes a 'Thread: Anchor' row for an Anchor-matched pattern (G-029 M3)", () => {
    const pattern = { ...makePattern(10, 10, [0], [[0, 0, 0]]), threadBrand: "anchor" as const };
    const rows = buildDetailRows(pattern, 14, "in");
    expect(Object.fromEntries(rows)["Thread"]).toBe("Anchor");
  });
});

describe("computeKeyColumns (G-016)", () => {
  it("omits the code column entirely (zero width) when not DMC mode", () => {
    const cols = computeKeyColumns(2000, false);
    expect(cols.codeW).toBe(0);
  });

  it("reserves real width for the code column in DMC mode", () => {
    const cols = computeKeyColumns(2000, true);
    expect(cols.codeW).toBeGreaterThan(0);
  });

  it("never lets columns exceed the printable width", () => {
    for (const isDmc of [true, false]) {
      const printableWidthPx = 2200;
      const cols = computeKeyColumns(printableWidthPx, isDmc);
      expect(cols.totalWidth).toBeLessThanOrEqual(printableWidthPx + 1); // rounding
    }
  });
});
