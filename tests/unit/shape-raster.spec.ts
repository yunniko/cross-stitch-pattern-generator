import { describe, expect, it } from "vitest";
import { lineCells, type CellPoint } from "@/lib/editor/shape-raster";

/** G-064 M3: the cells a line covers. Integer work on whole stitches -- no anti-aliasing, no half-covered cell. */

const key = (c: CellPoint) => `${c.x},${c.y}`;

/** The cells drawn as rows of text inside their own bounding box, which is the only readable form for a shape. */
function picture(cells: CellPoint[]): string[] {
  const x0 = Math.min(...cells.map((c) => c.x));
  const y0 = Math.min(...cells.map((c) => c.y));
  const x1 = Math.max(...cells.map((c) => c.x));
  const y1 = Math.max(...cells.map((c) => c.y));
  const on = new Set(cells.map(key));
  const rows: string[] = [];
  for (let y = y0; y <= y1; y++) {
    let row = "";
    for (let x = x0; x <= x1; x++) row += on.has(`${x},${y}`) ? "#" : ".";
    rows.push(row);
  }
  return rows;
}

describe("lineCells", () => {
  it("is the one cell when both ends are the same stitch", () => {
    expect(lineCells({ x: 4, y: 7 }, { x: 4, y: 7 })).toEqual([{ x: 4, y: 7 }]);
  });

  it("walks a straight run one cell at a time, ends included", () => {
    expect(lineCells({ x: 2, y: 5 }, { x: 5, y: 5 })).toEqual([
      { x: 2, y: 5 },
      { x: 3, y: 5 },
      { x: 4, y: 5 },
      { x: 5, y: 5 },
    ]);
    expect(picture(lineCells({ x: 0, y: 0 }, { x: 0, y: 3 }))).toEqual(["#", "#", "#", "#"]);
  });

  it("is the diagonal when the run is square", () => {
    expect(picture(lineCells({ x: 0, y: 0 }, { x: 3, y: 3 }))).toEqual(["#...", ".#..", "..#.", "...#"]);
    expect(picture(lineCells({ x: 3, y: 0 }, { x: 0, y: 3 }))).toEqual(["...#", "..#.", ".#..", "#..."]);
  });

  it("steps along the long axis on a shallow slope", () => {
    expect(picture(lineCells({ x: 0, y: 0 }, { x: 5, y: 2 }))).toEqual(["##....", "..##..", "....##"]);
  });

  it("covers the same cells whichever end it starts from", () => {
    const forward = lineCells({ x: 1, y: 2 }, { x: 9, y: 7 });
    const backward = lineCells({ x: 9, y: 7 }, { x: 1, y: 2 });
    expect(new Set(forward.map(key))).toEqual(new Set(backward.map(key)));
  });

  it("names every cell once, and the run is unbroken", () => {
    const cells = lineCells({ x: -3, y: 4 }, { x: 11, y: -6 });
    expect(new Set(cells.map(key)).size).toBe(cells.length);
    // Each step moves one column, one row, or one of each: a line a stitcher can follow without a gap.
    for (let i = 1; i < cells.length; i++) {
      expect(Math.abs(cells[i].x - cells[i - 1].x)).toBeLessThanOrEqual(1);
      expect(Math.abs(cells[i].y - cells[i - 1].y)).toBeLessThanOrEqual(1);
    }
    expect(cells[0]).toEqual({ x: -3, y: 4 });
    expect(cells[cells.length - 1]).toEqual({ x: 11, y: -6 });
  });

  it("is as long as the longer of its two spans", () => {
    expect(lineCells({ x: 0, y: 0 }, { x: 10, y: 3 })).toHaveLength(11);
    expect(lineCells({ x: 0, y: 0 }, { x: 3, y: 10 })).toHaveLength(11);
  });
});
