import { describe, expect, it } from "vitest";
import { BRUSH_SIZES, brushStamp, stampCells, stampOutline, type StampEdge } from "@/lib/editor/brush-stamp";

/** G-064 M2: what one press of the brush covers. Odd sizes only, so every stamp has a true centre (Owner, 2026-09-23). */

/** The stamp drawn as rows of text, which is the only way a shape is actually readable in a test. */
function picture(size: number, shape: "square" | "round"): string[] {
  const radius = Math.floor(size / 2);
  const inside = new Set(brushStamp(size, shape).map(({ dx, dy }) => `${dx},${dy}`));
  const rows: string[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    let row = "";
    for (let dx = -radius; dx <= radius; dx++) row += inside.has(`${dx},${dy}`) ? "#" : ".";
    rows.push(row);
  }
  return rows;
}

describe("brushStamp", () => {
  it("is one stitch at size 1, whatever the shape", () => {
    expect(brushStamp(1, "square")).toEqual([{ dx: 0, dy: 0 }]);
    expect(brushStamp(1, "round")).toEqual([{ dx: 0, dy: 0 }]);
  });

  it("covers the whole block when it is square", () => {
    expect(picture(3, "square")).toEqual(["###", "###", "###"]);
    expect(picture(5, "square")).toEqual(["#####", "#####", "#####", "#####", "#####"]);
  });

  it("is a disc when it is round", () => {
    expect(picture(3, "round")).toEqual(["###", "###", "###"]);
    expect(picture(5, "round")).toEqual([".###.", "#####", "#####", "#####", ".###."]);
    expect(picture(7, "round")).toEqual(["..###..", ".#####.", "#######", "#######", "#######", ".#####.", "..###.."]);
  });

  it("is symmetric about the centre, at every size the pane offers", () => {
    for (const size of BRUSH_SIZES) {
      for (const shape of ["square", "round"] as const) {
        const offsets = brushStamp(size, shape);
        const inside = new Set(offsets.map(({ dx, dy }) => `${dx},${dy}`));
        for (const { dx, dy } of offsets) {
          expect(inside.has(`${-dx},${dy}`), `${shape} ${size} mirrors left to right`).toBe(true);
          expect(inside.has(`${dx},${-dy}`), `${shape} ${size} mirrors top to bottom`).toBe(true);
        }
        expect(inside.has("0,0"), "the stitch under the pointer is always covered").toBe(true);
      }
    }
  });

  it("gives the same array every time, so a stroke cannot depend on order", () => {
    expect(brushStamp(7, "round")).toEqual(brushStamp(7, "round"));
  });
});

describe("stampCells", () => {
  it("lists the cells a press covers, row by row", () => {
    // A 3x3 square stamped at (2,2) of a 5-wide chart.
    expect(stampCells(2 * 5 + 2, 5, 5, brushStamp(3, "square"))).toEqual([6, 7, 8, 11, 12, 13, 16, 17, 18]);
  });

  it("clips at the edges rather than wrapping to the other side", () => {
    // At the top-left corner only the quarter that exists is painted, and nothing lands on row 1 or the last column.
    const cells = stampCells(0, 5, 5, brushStamp(3, "square"));

    expect(cells).toEqual([0, 1, 5, 6]);
    expect(cells.every((cell) => cell >= 0 && cell < 25)).toBe(true);
  });

  it("covers a single cell at size 1, which is the brush as it always was", () => {
    expect(stampCells(12, 5, 5, brushStamp(1, "round"))).toEqual([12]);
  });
});

/**
 * G-065 M1: the outline the cursor carries. An edge belongs to the boundary when the cell on its other side is not
 * in the stamp, so what is drawn is the stamp's own silhouette.
 */
describe("stampOutline", () => {
  const edge = (e: StampEdge) => `${e.x1},${e.y1}-${e.x2},${e.y2}`;

  it("is the four sides of the one cell at size 1", () => {
    expect(stampOutline(brushStamp(1, "round")).map(edge).sort()).toEqual(["0,0-0,1", "0,0-1,0", "0,1-1,1", "1,0-1,1"].sort());
  });

  it("is the block's border for a square brush, with no line inside it", () => {
    const edges = stampOutline(brushStamp(5, "square"));
    // A 5x5 block: twenty edges around it, and nothing between two cells that are both in the stamp.
    expect(edges).toHaveLength(20);
    expect(edges.every((e) => e.x1 === -2 || e.x1 === 3 || e.y1 === -2 || e.y1 === 3)).toBe(true);
  });

  it("follows the disc's staircase for a round brush", () => {
    const edges = stampOutline(brushStamp(5, "round")).map(edge);
    // The round 5 is the block with its four corners cut. A cut corner trades two edges for two others, so the ring
    // is the same twenty edges long as the block's -- what changes is where they run.
    expect(edges).toHaveLength(20);
    // Nothing is drawn around the missing corner cell...
    expect(edges).not.toContain("-2,-2--1,-2");
    // ...and the two edges that step around it are, which is the staircase.
    expect(edges).toContain("-2,-1--1,-1");
    expect(edges).toContain("-1,-2--1,-1");
  });

  it("closes: every corner it touches is touched an even number of times", () => {
    for (const size of BRUSH_SIZES) {
      for (const shape of ["round", "square"] as const) {
        const touches = new Map<string, number>();
        for (const e of stampOutline(brushStamp(size, shape))) {
          for (const corner of [`${e.x1},${e.y1}`, `${e.x2},${e.y2}`]) touches.set(corner, (touches.get(corner) ?? 0) + 1);
        }
        for (const [corner, count] of touches) {
          expect(count % 2, `${shape} ${size} at ${corner}`).toBe(0);
        }
      }
    }
  });

  it("draws each edge once, whatever the stamp", () => {
    for (const size of BRUSH_SIZES) {
      for (const shape of ["round", "square"] as const) {
        const edges = stampOutline(brushStamp(size, shape)).map(edge);
        expect(new Set(edges).size, `${shape} ${size}`).toBe(edges.length);
      }
    }
  });

  it("is empty for an empty stamp", () => {
    expect(stampOutline([])).toEqual([]);
  });
});
