import { describe, expect, it } from "vitest";
import { lineKey } from "@/lib/editor/backstitch";
import { duplicateSelection, liftSelection, mergeSelection, moveSelection } from "@/lib/editor/floating-selection";
import { regionMask } from "@/lib/editor/region";
import {
  areaFromBox,
  areaFromCells,
  combineAreas,
  emptyArea,
  invertArea,
  isEmptyArea,
  liftArea,
  linesOfColour,
  pieceArea,
  wandArea,
} from "@/lib/editor/selection-area";
import { NO_SYMMETRY, fillSymmetric } from "@/lib/editor/symmetry";
import { EMPTY_CELL, type BackstitchLine, type PaletteColor, type StitchPattern } from "@/lib/types";

/**
 * The selection as an area of the chart (G-116 M1, D330): made from a box, a shape or a colour's lines, combined by mode,
 * inverted, and lifted as the piece in hand. The region the Magic wand selects is the one Fill paints (D329).
 */

function palette(n: number): PaletteColor[] {
  return Array.from({ length: n }, (_, i) => ({
    index: i,
    rgb: [i * 10, i * 10, i * 10] as [number, number, number],
    symbol: String.fromCharCode(65 + i),
    name: `c${i}`,
    count: 0,
  }));
}

const RED: BackstitchLine = { x1: 0, y1: 0, x2: 2, y2: 0, paletteIndex: 1 };
const RED_EDGE: BackstitchLine = { x1: 6, y1: 1, x2: 6, y2: 4, paletteIndex: 1 };
const BLUE: BackstitchLine = { x1: 1, y1: 1, x2: 2, y2: 2, paletteIndex: 2 };

/** A 6x4 chart of colour 1 with three lines: two of colour 1 (one along the right edge) and one of colour 2. */
function chart(): StitchPattern {
  return {
    width: 6,
    height: 4,
    cellPalette: new Uint8Array(24).fill(1),
    palette: palette(3),
    isLandscape: true,
    backstitch: [RED, RED_EDGE, BLUE],
  };
}

const on = (area: { cells: Uint8Array }) => [...area.cells.keys()].filter((i) => area.cells[i]);
const keys = (lines: readonly BackstitchLine[]) => lines.map(lineKey).sort();

describe("selection areas", () => {
  it("a box takes its cells and the lines with both ends inside it, and a box off the chart keeps only its part on it", () => {
    const area = areaFromBox(chart(), { x: -1, y: -1, width: 4, height: 4 });
    expect(on(area)).toEqual([0, 1, 2, 6, 7, 8, 12, 13, 14]);
    expect(keys(area.lines)).toEqual(keys([RED, BLUE]));
  });

  it("add joins, subtract takes away, replace keeps only the new area, for cells and lines alike", () => {
    const p = chart();
    const left = areaFromBox(p, { x: 0, y: 0, width: 3, height: 1 });
    const right = areaFromBox(p, { x: 2, y: 0, width: 4, height: 1 });
    expect(on(combineAreas(left, right, "add"))).toEqual([0, 1, 2, 3, 4, 5]);
    expect(on(combineAreas(left, right, "subtract"))).toEqual([0, 1]);
    expect(combineAreas(left, right, "replace")).toBe(right);
    const withBlue = combineAreas(left, linesOfColour(p, 2), "add");
    expect(keys(withBlue.lines)).toEqual(keys([RED, BLUE]));
    expect(keys(combineAreas(withBlue, linesOfColour(p, 1), "subtract").lines)).toEqual(keys([BLUE]));
    // A line added twice, even drawn from its other end, is one line.
    const reversed = { ...linesOfColour(p, 2), lines: [{ ...BLUE, x1: 2, y1: 2, x2: 1, y2: 1 }] };
    expect(combineAreas(withBlue, reversed, "add").lines).toHaveLength(2);
  });

  it("refuses to combine areas of two different charts", () => {
    expect(() => combineAreas(emptyArea(chart()), { cells: new Uint8Array(3), lines: [] }, "add")).toThrow(/combine/);
  });

  it("invert selects everything else, and inverting twice gives back the same selection", () => {
    const p = chart();
    const area = combineAreas(areaFromBox(p, { x: 0, y: 0, width: 2, height: 2 }), linesOfColour(p, 2), "add");
    const inverted = invertArea(p, area);
    expect(on(inverted)).toHaveLength(24 - 4);
    expect(keys(inverted.lines)).toEqual(keys([RED_EDGE]));
    const back = invertArea(p, inverted);
    expect(on(back)).toEqual(on(area));
    expect(keys(back.lines)).toEqual(keys(area.lines));
    expect(isEmptyArea(invertArea(p, invertArea(p, emptyArea(p))))).toBe(true);
  });

  it("the lines of a colour are every line of it and no cells", () => {
    const area = linesOfColour(chart(), 1);
    expect(on(area)).toEqual([]);
    expect(keys(area.lines)).toEqual(keys([RED, RED_EDGE]));
  });
});

describe("lifting an area", () => {
  it("a full box lifts exactly as a rectangle selection does", () => {
    const p = chart();
    const rect = { x: 0, y: 0, width: 3, height: 2 };
    expect(liftArea(p, areaFromBox(p, rect))).toEqual(liftSelection(p, rect));
  });

  it("an empty area lifts nothing", () => {
    expect(liftArea(chart(), emptyArea(chart()))).toBeNull();
  });

  it("a colour's lines lift with no cells, and only they move when the piece is put down elsewhere", () => {
    const p = chart();
    const piece = liftArea(p, linesOfColour(p, 1))!;
    // The box spans both lines' ends; the edge line is at the chart's right edge, so the box ends there too.
    expect([piece.x, piece.y, piece.width, piece.height]).toEqual([0, 0, 6, 4]);
    expect(piece.mask!.every((v) => v === 0)).toBe(true);
    const merged = mergeSelection(p, moveSelection(piece, 0, 0));
    expect(keys(merged.backstitch!)).toEqual(keys(p.backstitch!));
    expect(merged.cellPalette).toEqual(p.cellPalette);
    const moved = mergeSelection(p, moveSelection(liftArea(p, linesOfColour(p, 2))!, 1, 0));
    expect(keys(moved.backstitch!)).toEqual(keys([RED, RED_EDGE, { ...BLUE, x1: 2, x2: 3 }]));
  });

  it("a straight line alone lifts as a one-cell-wide piece, inside the chart even at its edge", () => {
    const p = { ...chart(), backstitch: [RED_EDGE] };
    const piece = liftArea(p, linesOfColour(p, 1))!;
    expect([piece.x, piece.y, piece.width, piece.height]).toEqual([5, 1, 1, 3]);
    expect(piece.backstitch).toEqual([{ ...RED_EDGE, x1: 1, y1: 0, x2: 1, y2: 3 }]);
  });

  it("a piece clears at merge exactly the lines it took, and a duplicate clears none", () => {
    const p = chart();
    const piece = liftArea(p, combineAreas(areaFromBox(p, { x: 0, y: 0, width: 1, height: 1 }), linesOfColour(p, 2), "add"))!;
    expect(keys(piece.originLines!)).toEqual(keys([BLUE]));
    const merged = mergeSelection(p, moveSelection(piece, 0, 2));
    expect(keys(merged.backstitch!)).toEqual(keys([RED, RED_EDGE, { ...BLUE, y1: 3, y2: 4 }]));
    const copy = duplicateSelection(piece);
    expect(copy.originLines).toBeUndefined();
    expect(keys(mergeSelection(p, copy).backstitch!)).toContain(lineKey(BLUE));
  });

  it("a piece in hand, wherever it was moved, is the area it covers there", () => {
    const p = chart();
    const piece = moveSelection(liftSelection(p, { x: 0, y: 0, width: 3, height: 3 }), 2, 1);
    const area = pieceArea(mergeSelection(p, piece), piece);
    expect(on(area)).toEqual([8, 9, 10, 14, 15, 16, 20, 21, 22]);
    expect(keys(area.lines)).toEqual(
      keys([
        { ...RED, x1: 2, y1: 1, x2: 4, y2: 1 },
        { ...BLUE, x1: 3, y1: 2, x2: 4, y2: 3 },
      ])
    );
  });
});

describe("the wand's region is Fill's region (D329)", () => {
  /** A chart of three colours, empty cells and three stitch types, laid out irregularly enough to test both connectivities. */
  function mixed(): StitchPattern {
    const width = 9;
    const height = 7;
    const cellPalette = new Uint8Array(width * height);
    const cellKind = new Uint8Array(width * height);
    for (let i = 0; i < cellPalette.length; i++) {
      const v = (i * 7 + ((i * i) % 5)) % 4;
      cellPalette[i] = v === 3 ? EMPTY_CELL : v;
      cellKind[i] = v === 3 ? 0 : (i * 5) % 3 === 0 ? 1 : 0;
    }
    return { width, height, cellPalette, cellKind, palette: palette(4), isLandscape: true };
  }

  it("for every cell, both connectivities and both region rules, the cells match exactly", () => {
    const p = mixed();
    for (const connectivity of [4, 8] as const) {
      for (const colorOnly of [false, true]) {
        for (let cell = 0; cell < p.cellPalette.length; cell++) {
          const filled = fillSymmetric(p, cell, NO_SYMMETRY, 3, connectivity, 0, colorOnly ? { colorOnly: true } : { sameKind: true });
          const painted = [...filled.cellPalette.keys()].filter((i) => filled.cellPalette[i] === 3 && p.cellPalette[i] !== 3);
          expect(on({ cells: regionMask(p, cell, { connectivity, sameKind: !colorOnly }) })).toEqual(painted);
        }
      }
    }
  });

  it("a region becomes an area with the lines that lie on it", () => {
    const p = chart();
    p.cellPalette[0] = 2;
    p.cellPalette[1] = 2;
    const area = areaFromCells(p, regionMask(p, 0, { connectivity: 4 }));
    expect(on(area)).toEqual([0, 1]);
    expect(keys(area.lines)).toEqual(keys([RED]));
  });
});

describe("a wand click (G-116 M3)", () => {
  it("on a backstitch line takes every line of its colour and no stitches", () => {
    // On RED's body, a tenth of a cell below it: inside the hit band the backstitch tools use.
    const area = wandArea(chart(), 1, { x: 1, y: 0.1 }, { connectivity: 8, sameKind: true });
    expect(on(area)).toEqual([]);
    expect(keys(area.lines)).toEqual(keys([RED, RED_EDGE]));
  });

  it("off the lines takes the stitch's region, exactly the one Fill finds", () => {
    const p = chart();
    p.cellPalette[16] = 2;
    p.cellPalette[17] = 2;
    p.cellPalette[23] = 2;
    const rule = { connectivity: 4 as const, sameKind: true };
    const area = wandArea(p, 17, { x: 5.5, y: 2.5 }, rule);
    expect(on(area)).toEqual(on({ cells: regionMask(p, 17, rule) }));
    expect(on(area)).toEqual([16, 17, 23]);
  });

  it("on an empty stitch takes the touching empty area (decision (c))", () => {
    const p = chart();
    p.backstitch = [];
    for (const i of [8, 9, 14]) p.cellPalette[i] = EMPTY_CELL;
    expect(on(wandArea(p, 8, { x: 2.5, y: 1.5 }, { connectivity: 4 }))).toEqual([8, 9, 14]);
  });
});
