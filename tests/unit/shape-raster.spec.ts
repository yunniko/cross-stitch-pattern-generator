import { describe, expect, it } from "vitest";
import { lineCells, ovalCells, rectCells, type CellPoint } from "@/lib/editor/shape-raster";

/** G-064 M3 and M4: the cells a shape covers. Integer work on whole stitches -- no anti-aliasing, no half-covered cell. */

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

/** The cells inside a box read as a picture, so a shape can be checked by looking at it. */
function boxPicture(cells: CellPoint[], width: number, height: number): string[] {
  const on = new Set(cells.map(key));
  const rows: string[] = [];
  for (let y = 0; y < height; y++) {
    let row = "";
    for (let x = 0; x < width; x++) row += on.has(`${x},${y}`) ? "#" : ".";
    rows.push(row);
  }
  return rows;
}

describe("rectCells", () => {
  it("is the four sides when it is an outline", () => {
    expect(boxPicture(rectCells({ x: 0, y: 0 }, { x: 5, y: 3 }, "outline"), 6, 4)).toEqual(["######", "#....#", "#....#", "######"]);
  });

  it("is every stitch in the box when it is filled", () => {
    expect(rectCells({ x: 0, y: 0 }, { x: 5, y: 3 }, "filled")).toHaveLength(24);
    expect(boxPicture(rectCells({ x: 2, y: 1 }, { x: 4, y: 2 }, "filled"), 5, 3)).toEqual([".....", "..###", "..###"]);
  });

  it("is the same box whichever corner the drag started from", () => {
    const forward = rectCells({ x: 3, y: 9 }, { x: 8, y: 4 }, "outline").map(key).sort();
    const backward = rectCells({ x: 8, y: 4 }, { x: 3, y: 9 }, "outline").map(key).sort();
    expect(forward).toEqual(backward);
  });

  it("degenerates to the run, or the stitch, its box collapses to", () => {
    expect(rectCells({ x: 4, y: 4 }, { x: 4, y: 4 }, "outline")).toEqual([{ x: 4, y: 4 }]);
    expect(rectCells({ x: 4, y: 4 }, { x: 4, y: 7 }, "filled")).toHaveLength(4);
    expect(rectCells({ x: 4, y: 4 }, { x: 4, y: 7 }, "outline")).toHaveLength(4);
  });
});

describe("ovalCells", () => {
  it("is round, and symmetric in both directions", () => {
    expect(boxPicture(ovalCells({ x: 0, y: 0 }, { x: 8, y: 8 }, "outline"), 9, 9)).toEqual([
      "..#####..",
      ".#.....#.",
      "#.......#",
      "#.......#",
      "#.......#",
      "#.......#",
      "#.......#",
      ".#.....#.",
      "..#####..",
    ]);
  });

  it("fills the shape its outline rings", () => {
    const outline = ovalCells({ x: 0, y: 0 }, { x: 10, y: 6 }, "outline").map(key);
    const filled = ovalCells({ x: 0, y: 0 }, { x: 10, y: 6 }, "filled").map(key);
    expect(outline.every((cell) => filled.includes(cell))).toBe(true);
    expect(boxPicture(ovalCells({ x: 0, y: 0 }, { x: 10, y: 6 }, "filled"), 11, 7)).toEqual([
      "...#####...",
      ".#########.",
      "###########",
      "###########",
      "###########",
      ".#########.",
      "...#####...",
    ]);
  });

  it("stays inside its box and touches all four sides", () => {
    const cells = ovalCells({ x: 5, y: 2 }, { x: 18, y: 10 }, "filled");
    expect(Math.min(...cells.map((c) => c.x))).toBe(5);
    expect(Math.max(...cells.map((c) => c.x))).toBe(18);
    expect(Math.min(...cells.map((c) => c.y))).toBe(2);
    expect(Math.max(...cells.map((c) => c.y))).toBe(10);
  });

  it("is an unbroken ring: every outline stitch has a neighbour, corners counted", () => {
    const cells = ovalCells({ x: 0, y: 0 }, { x: 14, y: 8 }, "outline");
    const on = new Set(cells.map(key));
    for (const cell of cells) {
      const neighbours: string[] = [];
      for (const dy of [-1, 0, 1]) {
        for (const dx of [-1, 0, 1]) {
          if (dx !== 0 || dy !== 0) neighbours.push(`${cell.x + dx},${cell.y + dy}`);
        }
      }
      expect(neighbours.some((n) => on.has(n)), key(cell)).toBe(true);
    }
  });

  it("degenerates to the straight run its box collapses to", () => {
    expect(ovalCells({ x: 3, y: 1 }, { x: 3, y: 5 }, "outline").map(key)).toEqual(["3,1", "3,2", "3,3", "3,4", "3,5"]);
    expect(ovalCells({ x: 3, y: 1 }, { x: 7, y: 1 }, "filled").map(key)).toEqual(["3,1", "4,1", "5,1", "6,1", "7,1"]);
    expect(ovalCells({ x: 0, y: 0 }, { x: 0, y: 0 }, "filled")).toEqual([{ x: 0, y: 0 }]);
  });

  it("is the same oval whichever corner the drag started from", () => {
    const forward = ovalCells({ x: 2, y: 3 }, { x: 13, y: 11 }, "outline").map(key).sort();
    const backward = ovalCells({ x: 13, y: 11 }, { x: 2, y: 3 }, "outline").map(key).sort();
    expect(forward).toEqual(backward);
  });
});
