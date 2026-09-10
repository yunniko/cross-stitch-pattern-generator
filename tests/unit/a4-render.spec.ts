import { describe, expect, it } from "vitest";
import { overlapSidesForPage } from "@/lib/a4-render";
import { calculateA4Layout } from "@/lib/a4-layout";

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
