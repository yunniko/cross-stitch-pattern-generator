import { describe, expect, it } from "vitest";
import { BRUSH_SIZES, brushStamp, stampCells } from "@/lib/editor/brush-stamp";

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
    expect(picture(7, "round")).toEqual([
      "..###..",
      ".#####.",
      "#######",
      "#######",
      "#######",
      ".#####.",
      "..###..",
    ]);
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
