import { describe, expect, it } from "vitest";
import {
  clipLines,
  connectedRun,
  linesMeet,
  dedupeLines,
  symmetryLineOrbit,
  distanceToLine,
  endZoneFor,
  END_ZONE_CELLS,
  hitLine,
  linesBounds,
  mirrorLines,
  recolourLines,
  rotateLines,
  withEndAt,
  lengthByColor,
  lineLengthCells,
  lineWithinRect,
  flipLinesInBox,
  rotateLinesInBox,
  normalizeLine,
  sameLine,
  withColorRemovedFromLines,
} from "@/lib/editor/backstitch";
import { deserializePattern, serializePattern } from "@/lib/editor/pattern-serialize";
import {
  compositeSelectionPreview,
  flipSelectionHorizontal,
  liftSelection,
  mergeSelection,
  moveSelection,
  resizeCanvas,
  rotateSelectionClockwise,
  shiftPattern,
} from "@/lib/editor/pattern-edit";
import type { BackstitchLine, PaletteColor, StitchPattern } from "@/lib/types";

/** Backstitch as data (G-073 M1): corner coordinates, what survives a resize, and what a file round-trips. */

const line = (x1: number, y1: number, x2: number, y2: number, paletteIndex = 0): BackstitchLine => ({
  x1,
  y1,
  x2,
  y2,
  paletteIndex,
});

function palette(n: number): PaletteColor[] {
  return Array.from({ length: n }, (_, i) => ({
    index: i,
    rgb: [i * 40, i * 40, i * 40] as [number, number, number],
    symbol: String.fromCharCode(65 + i),
    name: `c${i}`,
    count: 0,
  }));
}

function chart(lines: BackstitchLine[]): StitchPattern {
  return {
    width: 6,
    height: 4,
    cellPalette: new Uint8Array(24),
    palette: palette(2),
    isLandscape: true,
    backstitch: lines,
  };
}

describe("backstitch geometry", () => {
  it("is the same stitch drawn either way round", () => {
    expect(sameLine(line(1, 1, 3, 2), line(3, 2, 1, 1))).toBe(true);
    expect(sameLine(line(1, 1, 3, 2), line(1, 1, 3, 3))).toBe(false);
    expect(normalizeLine(line(3, 2, 1, 1))).toEqual(line(1, 1, 3, 2));
  });

  it("measures a diagonal as a diagonal, not as one cell", () => {
    // The legend's metres depend on this: a corner-to-corner diagonal is √2 cells, not 1.
    expect(lineLengthCells(line(0, 0, 1, 1))).toBeCloseTo(Math.SQRT2);
    expect(lineLengthCells(line(0, 0, 3, 0))).toBe(3);
  });

  it("totals length per thread, leaving a thread with no lines at zero", () => {
    const totals = lengthByColor([line(0, 0, 2, 0, 1), line(0, 1, 1, 1, 1)], 3);
    expect(totals).toEqual([0, 3, 0]);
  });

  it("takes a line only when both ends are inside the area", () => {
    const rect = { x: 1, y: 1, width: 3, height: 3 };
    expect(lineWithinRect(line(1, 1, 4, 4), rect)).toBe(true);
    expect(lineWithinRect(line(1, 1, 5, 4), rect)).toBe(false);
    expect(lineWithinRect(line(0, 1, 2, 2), rect)).toBe(false);
  });

  it("drops a line the chart no longer holds, rather than cutting it short", () => {
    const lines = [line(0, 0, 2, 2), line(4, 3, 6, 4)];
    expect(clipLines(lines, 3, 3)).toEqual([line(0, 0, 2, 2)]);
  });

  it("keeps a line that ends exactly on the far corner", () => {
    // Corners run 0..width inclusive, so (6,4) is on a 6x4 chart and not past it.
    expect(clipLines([line(5, 3, 6, 4)], 6, 4)).toHaveLength(1);
  });

  it("does not stack a line drawn twice", () => {
    expect(dedupeLines([line(0, 0, 1, 1), line(1, 1, 0, 0), line(0, 0, 1, 2)])).toHaveLength(2);
  });

  it("merges a thread's lines into another, or deletes them", () => {
    const lines = [line(0, 0, 1, 1, 0), line(1, 1, 2, 2, 1), line(2, 2, 3, 3, 2)];
    // Colour 1 merged into colour 2, which is then index 1 because 1 was removed.
    expect(withColorRemovedFromLines(lines, 1, 2).map((l) => l.paletteIndex)).toEqual([0, 1, 1]);
    // Merged into nothing: those lines go, and later indices close up.
    expect(withColorRemovedFromLines(lines, 1, null).map((l) => l.paletteIndex)).toEqual([0, 1]);
  });
});

describe("backstitch travels with the chart", () => {
  it("moves with a shift and goes when pushed off the edge", () => {
    const moved = shiftPattern(chart([line(0, 0, 2, 0), line(5, 3, 6, 4)]), 1, 0);
    // The first line moved; the second ran past the right edge, and a straight line has no partial form.
    expect(moved.backstitch).toEqual([line(1, 0, 3, 0)]);
  });

  it("moves with a resize and is cropped away with the cells", () => {
    const grown = resizeCanvas(chart([line(0, 0, 2, 0)]), { left: 2, right: 0, top: 1, bottom: 0 });
    expect(grown.backstitch).toEqual([line(2, 1, 4, 1)]);

    const cropped = resizeCanvas(chart([line(0, 0, 2, 0)]), { left: -3, right: 0, top: 0, bottom: 0 });
    expect(cropped.backstitch).toBeUndefined();
  });

  it("leaves a chart without backstitch exactly as it was", () => {
    const plain: StitchPattern = { ...chart([]), backstitch: undefined };
    expect(shiftPattern(plain, 1, 1).backstitch).toBeUndefined();
    expect(resizeCanvas(plain, { left: 1, right: 0, top: 0, bottom: 0 }).backstitch).toBeUndefined();
  });
});

describe("backstitch in a saved file", () => {
  it("round-trips through the editable save", () => {
    const lines = [line(0, 0, 2, 2, 1), line(3, 1, 3, 4, 0)];
    const back = deserializePattern(serializePattern(chart(lines)));
    expect(back.backstitch).toEqual(lines);
  });

  it("is absent from a file that has none, so an older build reads the same bytes it always did", () => {
    const json = JSON.parse(serializePattern({ ...chart([]), backstitch: undefined }));
    expect("backstitch" in json).toBe(false);
  });

  it("refuses a line outside the grid, in a colour it does not have, or with no length", () => {
    const withLines = (lines: unknown) => {
      const doc = JSON.parse(serializePattern(chart([])));
      return JSON.stringify({ ...doc, backstitch: lines });
    };
    expect(() => deserializePattern(withLines([{ x1: 0, y1: 0, x2: 7, y2: 0, paletteIndex: 0 }]))).toThrow(/outside its own grid/);
    expect(() => deserializePattern(withLines([{ x1: 0, y1: 0, x2: 1, y2: 0, paletteIndex: 9 }]))).toThrow(/isn't in its own palette/);
    expect(() => deserializePattern(withLines([{ x1: 2, y1: 2, x2: 2, y2: 2, paletteIndex: 0 }]))).toThrow(/no length/);
    expect(() => deserializePattern(withLines("nope"))).toThrow(/isn't a list/);
  });

  it("accepts a line ending on the far corner, which is one past the last cell", () => {
    const doc = JSON.parse(serializePattern(chart([])));
    const json = JSON.stringify({ ...doc, backstitch: [{ x1: 5, y1: 3, x2: 6, y2: 4, paletteIndex: 0 }] });
    expect(deserializePattern(json).backstitch).toHaveLength(1);
  });
});

describe("backstitch under symmetry", () => {
  const axes = (on: Record<string, boolean>) =>
    ({ vertical: false, horizontal: false, diagonal: false, antidiagonal: false, ...on }) as never;

  it("mirrors a line about the chart's middle, not half a cell off it", () => {
    // Corners run 0..6 on a 6-wide chart, so the mirror of 0 is 6 and the mirror of 2 is 4. Using the cell
    // formula here would put them at 5 and 3 — a shift of half a cell, which looks almost right.
    const mirrored = symmetryLineOrbit(line(0, 0, 2, 0), 6, 4, axes({ vertical: true }));
    expect(mirrored).toContainEqual(line(6, 0, 4, 0));
    expect(mirrored).toHaveLength(2);
  });

  it("gives four lines for two axes, and one for none", () => {
    expect(symmetryLineOrbit(line(0, 0, 1, 1), 6, 4, axes({ vertical: true, horizontal: true }))).toHaveLength(4);
    expect(symmetryLineOrbit(line(0, 0, 1, 1), 6, 4, axes({}))).toHaveLength(1);
  });

  it("does not repeat a line lying on the axis it is mirrored about", () => {
    // A line straight down the middle of a 6-wide chart maps onto itself.
    expect(symmetryLineOrbit(line(3, 0, 3, 4), 6, 4, axes({ vertical: true }))).toHaveLength(1);
  });
});

describe("what the pointer is on", () => {
  it("measures to the segment, not to the infinite line it lies on", () => {
    const l = line(0, 0, 4, 0);
    expect(distanceToLine(l, 2, 1)).toBe(1);
    // Past the end, the distance is to the end itself, so a click far off the end does not count as on it.
    expect(distanceToLine(l, 7, 0)).toBe(3);
  });

  it("takes the whole line, ends included, when nothing is in hand", () => {
    // One tool does both jobs, so a press on a line nobody holds always means "take this line" — otherwise
    // a line could not be moved by a press near its end without a second tool for it (D229).
    const lines = [line(0, 0, 4, 0)];
    expect(hitLine(lines, 0.1, 0)).toEqual({ index: 0, part: "body" });
    expect(hitLine(lines, 3.95, 0)).toEqual({ index: 0, part: "body" });
    expect(hitLine(lines, 2, 0)).toEqual({ index: 0, part: "body" });
    expect(hitLine(lines, 2, 2)).toBeNull();
  });

  it("takes an end, before the body it also touches, once the line is in hand", () => {
    const lines = [line(0, 0, 4, 0)];
    const inHand = () => true;
    expect(hitLine(lines, 0.1, 0, inHand)).toEqual({ index: 0, part: "start" });
    expect(hitLine(lines, 3.95, 0, inHand)).toEqual({ index: 0, part: "end" });
    expect(hitLine(lines, 2, 0, inHand)).toEqual({ index: 0, part: "body" });
  });

  it("makes only the held line's ends live, not its neighbour's", () => {
    const held = line(0, 0, 4, 0);
    const other = line(0, 2, 4, 2);
    const inHand = (l: BackstitchLine) => sameLine(l, held);
    expect(hitLine([held, other], 0.1, 0, inHand)).toEqual({ index: 0, part: "start" });
    expect(hitLine([held, other], 0.1, 2, inHand)).toEqual({ index: 1, part: "body" });
  });

  it("leaves a short line a body to grab: the end zone is never more than a third of it", () => {
    // At the flat 0.42 a one-cell line was 84% end zone, and could not be moved at all once selected.
    expect(endZoneFor(1)).toBeCloseTo(1 / 3);
    expect(endZoneFor(10)).toBe(END_ZONE_CELLS);
    const short = [line(0, 0, 1, 0)];
    const inHand = () => true;
    expect(hitLine(short, 0.5, 0, inHand)).toEqual({ index: 0, part: "body" });
    expect(hitLine(short, 0.05, 0, inHand)).toEqual({ index: 0, part: "start" });
  });

  it("takes the line drawn last where two overlap", () => {
    const lines = [line(0, 0, 4, 0), line(0, 0, 4, 0, 1)];
    expect(hitLine(lines, 2, 0)?.index).toBe(1);
  });
});

describe("editing a line", () => {
  it("moves one end and leaves the other", () => {
    expect(withEndAt(line(0, 0, 4, 0), "start", 1, 1)).toEqual(line(1, 1, 4, 0));
    expect(withEndAt(line(0, 0, 4, 0), "end", 1, 1)).toEqual(line(0, 0, 1, 1));
  });

  it("mirrors within its own box, so the piece stays where it was put", () => {
    const lines = [line(2, 2, 6, 4)];
    expect(linesBounds(lines)).toEqual({ x: 2, y: 2, width: 4, height: 2 });
    expect(mirrorLines(lines, "horizontal")).toEqual([line(6, 2, 2, 4)]);
    expect(mirrorLines(lines, "vertical")).toEqual([line(2, 4, 6, 2)]);
  });

  it("turns a quarter turn each way, and four turns come home", () => {
    const lines = [line(0, 0, 2, 1)];
    let turned = lines as ReturnType<typeof rotateLines>;
    for (let i = 0; i < 4; i++) turned = rotateLines(turned, true);
    expect(turned).toEqual(lines);
    expect(rotateLines(rotateLines(lines, true), false)).toEqual(lines);
  });

  it("recolours every line and changes nothing else", () => {
    expect(recolourLines([line(0, 0, 1, 1, 0), line(1, 1, 2, 2, 1)], 3)).toEqual([line(0, 0, 1, 1, 3), line(1, 1, 2, 2, 3)]);
  });
});

describe("a cell selection carries backstitch", () => {
  /** A 6x4 chart with one line across its middle, from corner (1,1) to corner (4,1). */
  const withLine = () => chart([line(1, 1, 4, 1)]);

  it("takes a line only when both ends are inside the rectangle", () => {
    const inside = liftSelection(withLine(), { x: 1, y: 0, width: 4, height: 3 });
    // Lifted into the piece's own corners: the rectangle starts at cell 1, so corner 1 becomes corner 0.
    expect(inside.backstitch).toEqual([line(0, 1, 3, 1)]);

    // One end at corner 4, a rectangle reaching only corner 3: the line is left on the chart.
    const partial = liftSelection(withLine(), { x: 1, y: 0, width: 2, height: 3 });
    expect(partial.backstitch).toBeUndefined();
  });

  it("counts a corner as inside a shaped piece when any cell meeting it is", () => {
    const rect = { x: 0, y: 0, width: 6, height: 4 };
    // Only the top-left 2x2 cells are in the piece, so corners 0..2 in each direction belong to it.
    const mask = new Uint8Array(24);
    for (const i of [0, 1, 6, 7]) mask[i] = 1;
    expect(lineWithinRect(line(0, 0, 2, 2), rect, mask)).toBe(true);
    // Corner (3,1) touches only cells the mask excludes.
    expect(lineWithinRect(line(0, 0, 3, 1), rect, mask)).toBe(false);
  });

  it("shows the carried line where the piece is, and the chart's own where it was drawn", () => {
    const base = withLine();
    const piece = moveSelection(liftSelection(base, { x: 0, y: 0, width: 6, height: 2 }), 0, 2);
    const shown = compositeSelectionPreview(base, piece);
    // Two lines until the piece is put down, exactly as the cells under it stay until then.
    expect(shown.backstitch).toEqual([line(1, 1, 4, 1), line(1, 3, 4, 3)]);
  });

  it("moves the line with the piece when it merges, leaving nothing behind", () => {
    const base = withLine();
    const piece = moveSelection(liftSelection(base, { x: 0, y: 0, width: 6, height: 2 }), 0, 2);
    expect(mergeSelection(base, piece).backstitch).toEqual([line(1, 3, 4, 3)]);
  });

  it("leaves a line the piece did not take exactly where it was", () => {
    const base = chart([line(1, 1, 4, 1), line(0, 3, 6, 3)]);
    const piece = moveSelection(liftSelection(base, { x: 0, y: 0, width: 6, height: 2 }), 0, 1);
    expect(mergeSelection(base, piece).backstitch).toEqual([line(0, 3, 6, 3), line(1, 2, 4, 2)]);
  });

  it("flips and turns the carried line with the cells, not against them", () => {
    const piece = liftSelection(withLine(), { x: 0, y: 0, width: 6, height: 4 });
    // A 6-wide box: corner 1 mirrors to 5 and corner 4 to 2.
    expect(flipSelectionHorizontal(piece).backstitch).toEqual([line(5, 1, 2, 1)]);
    // Clockwise in a 6x4 box: (x, y) goes to (4 - y, x), and the box becomes 4 wide.
    expect(rotateSelectionClockwise(piece).backstitch).toEqual([line(3, 1, 3, 4)]);
  });

  it("keeps corners and cells in step under a flip and a turn", () => {
    // The cell arithmetic is `width - 1 - cx`; the corner bounding it is `width - x`. A line drawn along the
    // left edge of the box must land along its right edge, not one cell inside it.
    expect(flipLinesInBox([line(0, 0, 0, 4)], 6, 4, "horizontal")).toEqual([line(6, 0, 6, 4)]);
    expect(flipLinesInBox([line(0, 0, 6, 0)], 6, 4, "vertical")).toEqual([line(0, 4, 6, 4)]);
    // The box's top-left corner goes to its top-right under a clockwise turn.
    expect(rotateLinesInBox([line(0, 0, 6, 0)], 6, 4, true)).toEqual([line(4, 0, 4, 6)]);
    expect(rotateLinesInBox([line(0, 0, 6, 0)], 6, 4, false)).toEqual([line(0, 6, 0, 0)]);
  });

  it("leaves a chart without backstitch untouched", () => {
    const plain: StitchPattern = { ...chart([]), backstitch: undefined };
    const piece = liftSelection(plain, { x: 0, y: 0, width: 3, height: 2 });
    expect(piece.backstitch).toBeUndefined();
    expect(mergeSelection(plain, moveSelection(piece, 1, 1)).backstitch).toBeUndefined();
  });
});

describe("a run of connected backstitch", () => {
  it("joins lines that meet at an end, whichever ends those are", () => {
    expect(linesMeet(line(0, 0, 2, 0), line(2, 0, 2, 2))).toBe(true);
    // Drawn the other way round, the same two still meet.
    expect(linesMeet(line(2, 0, 0, 0), line(2, 2, 2, 0))).toBe(true);
    expect(linesMeet(line(0, 0, 2, 0), line(3, 0, 5, 0))).toBe(false);
  });

  it("does not join a line that merely crosses another's middle", () => {
    // A cross is two strokes, not one: only ends join (Owner, 2026-09-25).
    expect(linesMeet(line(0, 0, 4, 0), line(2, -2, 2, 2))).toBe(false);
  });

  it("follows the chain as far as it goes, past lines that never touch the first", () => {
    const chain = [line(0, 0, 2, 0), line(2, 0, 2, 2), line(2, 2, 0, 2)];
    // The third never touches the first, but the run reaches it through the second.
    expect(connectedRun(chain, 0)).toEqual(chain);
    expect(connectedRun(chain, 2)).toEqual(chain);
  });

  it("takes every branch of a junction", () => {
    const star = [line(2, 2, 0, 2), line(2, 2, 4, 2), line(2, 2, 2, 0)];
    expect(connectedRun(star, 1)).toHaveLength(3);
  });

  it("stops at another thread, even where it shares the corner", () => {
    const lines = [line(0, 0, 2, 0), line(2, 0, 2, 2, 1), line(2, 0, 4, 0)];
    // The middle line is a different thread: the run passes it by and takes the third, which shares the
    // same corner in the same thread.
    expect(connectedRun(lines, 0)).toEqual([line(0, 0, 2, 0), line(2, 0, 4, 0)]);
    expect(connectedRun(lines, 1)).toEqual([line(2, 0, 2, 2, 1)]);
  });

  it("gives a lone line as a run of itself, and nothing for an index that is not there", () => {
    const lines = [line(0, 0, 2, 0), line(5, 5, 6, 6)];
    expect(connectedRun(lines, 1)).toEqual([line(5, 5, 6, 6)]);
    expect(connectedRun(lines, 7)).toEqual([]);
  });

  it("returns the run in the chart's own order, whichever line it started from", () => {
    const chain = [line(0, 0, 2, 0), line(2, 0, 2, 2), line(2, 2, 0, 2)];
    expect(connectedRun(chain, 1)).toEqual(chain);
  });
});
