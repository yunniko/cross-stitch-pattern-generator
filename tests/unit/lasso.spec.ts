import { describe, expect, it } from "vitest";
import { lassoRegion } from "@/lib/editor/lasso";
import type { CellPoint } from "@/lib/editor/shape-raster";

/** A freehand path turned into the cells it selects (G-072 M2). */

const p = (x: number, y: number): CellPoint => ({ x, y });

/** The region drawn as rows of `#` and `.`, so a shape can be read rather than counted. */
function picture(path: CellPoint[], width: number, height: number): string[] {
  const region = lassoRegion(path, width, height);
  if (!region) return [];
  const { rect, mask } = region;
  return Array.from({ length: rect.height }, (_, y) =>
    Array.from({ length: rect.width }, (_, x) => (mask[y * rect.width + x] ? "#" : ".")).join("")
  );
}

describe("the cells a freehand path encloses", () => {
  it("fills a square drawn as four corners", () => {
    expect(picture([p(1, 1), p(4, 1), p(4, 4), p(1, 4)], 8, 8)).toEqual(["####", "####", "####", "####"]);
  });

  it("crops to what it selected, not to the chart", () => {
    const region = lassoRegion([p(2, 3), p(5, 3), p(5, 6), p(2, 6)], 10, 10)!;
    expect(region.rect).toEqual({ x: 2, y: 3, width: 4, height: 4 });
  });

  it("fills a triangle as a triangle", () => {
    expect(picture([p(0, 0), p(4, 4), p(0, 4)], 8, 8)).toEqual(["#....", "##...", "###..", "####.", "#####"]);
  });

  it("selects the path itself when it encloses nothing", () => {
    // A back-and-forth scribble has no interior, but the stitches it was drawn over are what the user saw it cover.
    expect(picture([p(1, 1), p(5, 1)], 8, 8)).toEqual(["#####"]);
  });

  it("selects a single cell for a single tap", () => {
    expect(picture([p(3, 3)], 8, 8)).toEqual(["#"]);
  });

  it("closes the shape itself, so the last point need not meet the first", () => {
    const open = picture([p(1, 1), p(4, 1), p(4, 4), p(1, 4)], 8, 8);
    const closed = picture([p(1, 1), p(4, 1), p(4, 4), p(1, 4), p(1, 1)], 8, 8);
    expect(closed).toEqual(open);
  });

  it("carves a hole where the path crosses itself, rather than merging the lobes", () => {
    // A bow tie: even-odd leaves the crossing empty, which is what makes a lasso predictable.
    const rows = picture([p(0, 0), p(6, 0), p(0, 6), p(6, 6)], 10, 10);
    expect(rows[0]).toBe("#######");
    expect(rows[3]).toBe("...#...");
    expect(rows[6]).toBe("#######");
  });

  it("keeps the part of a shape that is on the chart when the drag ran off it", () => {
    const region = lassoRegion([p(-3, 1), p(2, 1), p(2, 4), p(-3, 4)], 8, 8)!;
    expect(region.rect.x).toBe(0);
    expect(region.rect.width).toBe(3);
    expect(region.rect.height).toBe(4);
  });

  it("selects nothing for a path entirely off the chart", () => {
    expect(lassoRegion([p(-5, -5), p(-3, -5), p(-3, -3)], 8, 8)).toBeNull();
  });

  it("selects nothing for an empty path", () => {
    expect(lassoRegion([], 8, 8)).toBeNull();
  });

  it("stays inside the chart for a path that surrounds it entirely", () => {
    const region = lassoRegion([p(-2, -2), p(9, -2), p(9, 9), p(-2, 9)], 4, 4)!;
    expect(region.rect).toEqual({ x: 0, y: 0, width: 4, height: 4 });
    expect(region.mask.every((v) => v === 1)).toBe(true);
  });
});
