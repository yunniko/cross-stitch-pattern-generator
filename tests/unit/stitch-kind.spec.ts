import { describe, expect, it } from "vitest";
import { createBlankPattern } from "@/lib/editor/blank-pattern";
import { addColor, fillCluster, fillClusterDiagonal, mergeColors, paintStitch, resizeCanvas, shiftPattern, withCellPalette } from "@/lib/editor/pattern-edit";
import { duplicateSelection, fillSelection, flipSelectionHorizontal, flipSelectionVertical, liftSelection, mergeSelection, rotateSelectionAnticlockwise, rotateSelectionClockwise } from "@/lib/editor/floating-selection";
import { deserializePattern, serializePattern } from "@/lib/editor/pattern-serialize";
import {
  hasHalfStitches,
  kindCounts,
  kindUnderMatrix,
  STITCH_BACKSLASH as B,
  STITCH_SLASH as S,
  STITCH_WHOLE as W,
  swapKind,
  tidyKinds,
} from "@/lib/editor/stitch-kind";
import { applyQuickMirror, fillSymmetric, NO_SYMMETRY, symmetryOrbitKinds } from "@/lib/editor/symmetry";
import { EMPTY_CELL, type FloatingSelection, type StitchPattern } from "@/lib/types";

/** G-082 M1: half stitches in the model, the edits and the saved file. */

/** A chart of `width` × `height` with two threads, painted from `cells` (a thread index or `.` for empty) and `kinds` (w / s for "/" or b for "\"). */
function chart(width: number, height: number, cells: string, kinds?: string): StitchPattern {
  // The blank-chart factory refuses anything under 10 stitches, so take its threads and set the size by hand.
  let base = createBlankPattern(10, 10);
  base = addColor(base, [200, 30, 30]);
  base = addColor(base, [30, 30, 200]);
  const empty = new Uint8Array(width * height).fill(EMPTY_CELL);
  const pattern: StitchPattern = { ...base, width, height, isLandscape: width >= height, cellPalette: empty, cellKind: undefined };
  const cellPalette = Uint8Array.from(cells.replace(/[\s/]/g, ""), (c) => (c === "." ? EMPTY_CELL : Number(c)));
  const cellKind = kinds ? Uint8Array.from(kinds.replace(/[\s/]/g, ""), (c) => (c === "s" ? S : c === "b" ? B : W)) : undefined;
  return withCellPalette(pattern, cellPalette, cellKind);
}
const axes = (on: Partial<typeof NO_SYMMETRY>) => ({ ...NO_SYMMETRY, ...on });
const kindsOf = (p: { cellKind?: Uint8Array }, length: number) => Array.from(p.cellKind ?? new Uint8Array(length));

describe("kindUnderMatrix and swapKind", () => {
  it("lays a half stitch across the other diagonal under a mirror or a quarter turn, not under a half turn or a diagonal mirror", () => {
    expect(swapKind(S)).toBe(B);
    expect(swapKind(B)).toBe(S);
    expect(swapKind(W)).toBe(W);
    expect(kindUnderMatrix(S, [-1, 0, 0, 1])).toBe(B); // mirror left-right
    expect(kindUnderMatrix(S, [1, 0, 0, -1])).toBe(B); // mirror top-bottom
    expect(kindUnderMatrix(S, [0, -1, 1, 0])).toBe(B); // quarter turn
    expect(kindUnderMatrix(B, [0, 1, -1, 0])).toBe(S); // the other quarter turn
    expect(kindUnderMatrix(S, [-1, 0, 0, -1])).toBe(S); // half turn
    expect(kindUnderMatrix(S, [0, 1, 1, 0])).toBe(S); // mirror across the main diagonal
    expect(kindUnderMatrix(B, [0, -1, -1, 0])).toBe(B); // mirror across the other diagonal
    expect(kindUnderMatrix(W, [0, -1, 1, 0])).toBe(W);
  });
});

describe("tidyKinds", () => {
  it("is nothing for no kinds or all-whole kinds, and makes an empty cell whole", () => {
    expect(tidyKinds([0, 1], undefined)).toBeUndefined();
    expect(tidyKinds([0, 1], Uint8Array.of(W, W))).toBeUndefined();
    expect(Array.from(tidyKinds([0, EMPTY_CELL], Uint8Array.of(S, S))!)).toEqual([S, W]);
    expect(tidyKinds([EMPTY_CELL], Uint8Array.of(S))).toBeUndefined();
    expect(() => tidyKinds([0], Uint8Array.of(S, S))).toThrow();
  });
});

describe("painting", () => {
  it("lays the kind asked for, and a whole-stitch repaint of a half stitch makes it whole", () => {
    let p = chart(3, 1, "0 0 0");
    p = paintStitch(p, 1, 1, S);
    expect(kindsOf(p, 3)).toEqual([W, S, W]);
    expect(hasHalfStitches(p)).toBe(true);
    p = paintStitch(p, 1, 0); // default: whole
    expect(p.cellKind).toBeUndefined();
    expect(hasHalfStitches(p)).toBe(false);
  });

  it("an eraser leaves no half stitch behind, and a tool that knows nothing of kinds changes a half stitch to whole", () => {
    let p = paintStitch(chart(3, 1, "0 0 0"), 0, 1, B);
    p = paintStitch(p, 0, EMPTY_CELL, S);
    expect(p.cellKind).toBeUndefined();
    p = chart(3, 1, "0 1 0", "s b w");
    const recoloured = withCellPalette(p, Uint8Array.of(0, 0, 0)); // the middle cell changed: whole now
    expect(kindsOf(recoloured, 3)).toEqual([S, W, W]);
  });

  it("fills a region with the kind chosen, 4- and 8-connected", () => {
    const p = chart(3, 2, "0 0 1 / 0 1 1", "s w w / w w w");
    expect(kindsOf(fillCluster(p, 0, 1, B), 6)).toEqual([B, B, W, B, W, W]);
    const q = chart(3, 2, "0 . 1 / . 0 1");
    expect(kindsOf(fillClusterDiagonal(q, 0, 1, S), 6)).toEqual([S, W, W, W, S, W]);
  });
});

describe("merging colours", () => {
  it("recolours stitches without changing what kind they are", () => {
    const p = chart(3, 1, "0 1 1", "w s b");
    const merged = mergeColors(p, 1, 0);
    expect(Array.from(merged.cellPalette)).toEqual([0, 0, 0]);
    expect(kindsOf(merged, 3)).toEqual([W, S, B]);
    const emptied = mergeColors(p, 1, EMPTY_CELL);
    expect(emptied.cellKind).toBeUndefined();
  });
});

describe("shifting and resizing", () => {
  it("shift wraps the kinds with the stitches", () => {
    const p = chart(3, 1, "0 0 0", "w s b");
    expect(kindsOf(shiftPattern(p, 1, 0), 3)).toEqual([B, W, S]);
  });

  it("resize carries the kinds, crops them with the stitches and leaves new cells whole", () => {
    const p = chart(3, 1, "0 0 0", "w s b");
    const grown = resizeCanvas(p, { left: 1, right: 0, top: 0, bottom: 0 });
    expect(kindsOf(grown, 4)).toEqual([W, W, S, B]);
    const cropped = resizeCanvas(p, { left: -1, right: 0, top: 0, bottom: 0 });
    expect(kindsOf(cropped, 2)).toEqual([S, B]);
    expect(resizeCanvas(p, { left: 0, right: -2, top: 0, bottom: 0 }).cellKind).toBeUndefined();
  });
});

describe("a selection", () => {
  const lifted = (): FloatingSelection => liftSelection(chart(3, 2, "0 0 1 / 1 0 0", "s b w / w s b"), { x: 0, y: 0, width: 3, height: 2 });

  it("takes the kinds of the cells it lifts, and none when they are all whole", () => {
    expect(Array.from(lifted().kinds!)).toEqual([S, B, W, W, S, B]);
    expect(liftSelection(chart(2, 1, "0 0"), { x: 0, y: 0, width: 2, height: 1 }).kinds).toBeUndefined();
  });

  it("turns '/' into '\\' with a flip, with a quarter turn either way, and back with the second flip", () => {
    const s = lifted();
    expect(Array.from(flipSelectionHorizontal(s).kinds!)).toEqual([W, S, B, S, B, W]); // columns reversed, every half swapped
    expect(Array.from(flipSelectionVertical(s).kinds!)).toEqual([W, B, S, B, S, W]); // rows reversed, swapped
    expect(Array.from(flipSelectionHorizontal(flipSelectionHorizontal(s)).kinds!)).toEqual(Array.from(s.kinds!));
    const cw = rotateSelectionClockwise(s);
    expect(cw.width).toBe(2);
    expect(Array.from(rotateSelectionAnticlockwise(cw).kinds!)).toEqual(Array.from(s.kinds!));
    // A single "/" turned clockwise lies as "\".
    const one = liftSelection(chart(1, 1, "0", "s"), { x: 0, y: 0, width: 1, height: 1 });
    expect(Array.from(rotateSelectionClockwise(one).kinds!)).toEqual([B]);
  });

  it("puts the kinds down where the piece lands, vacates them where it came from, and keeps them in a duplicate", () => {
    const base = chart(4, 1, "0 0 . .", "s b w w");
    const piece = liftSelection(base, { x: 0, y: 0, width: 2, height: 1 });
    const moved = mergeSelection(base, { ...piece, x: 2 });
    expect(Array.from(moved.cellPalette)).toEqual([EMPTY_CELL, EMPTY_CELL, 0, 0]);
    expect(kindsOf(moved, 4)).toEqual([W, W, S, B]);
    expect(Array.from(duplicateSelection(piece).kinds!)).toEqual([S, B]);
  });

  it("stamps a masked piece's kinds only where the mask is", () => {
    const base = chart(3, 1, "1 1 1", "b b b");
    const piece: FloatingSelection = {
      x: 0,
      y: 0,
      width: 3,
      height: 1,
      cells: Uint8Array.of(0, 0, 0),
      kinds: Uint8Array.of(S, S, S),
      mask: Uint8Array.of(1, 0, 1),
    };
    expect(kindsOf(mergeSelection(base, piece), 3)).toEqual([S, B, S]);
  });

  it("fill selection lays the chosen kind, only on stitches when the lock asks", () => {
    const s = lifted();
    expect(Array.from(fillSelection(s, 1, false, B).kinds!)).toEqual([B, B, B, B, B, B]);
    expect(fillSelection(s, 1).kinds).toBeUndefined();
    const withHole = liftSelection(chart(2, 1, "0 .", "s w"), { x: 0, y: 0, width: 2, height: 1 });
    expect(Array.from(fillSelection(withHole, 1, true, B).kinds!)).toEqual([B, W]);
  });
});

describe("symmetry", () => {
  it("gives each copy the kind the mirror lays it as", () => {
    const orbit = symmetryOrbitKinds(0, 3, 3, axes({ vertical: true, horizontal: true }), S);
    expect(orbit).toHaveLength(4);
    const byIndex = new Map(orbit.map((o) => [o.index, o.kind]));
    expect(byIndex.get(0)).toBe(S);
    expect(byIndex.get(2)).toBe(B); // across the vertical centre line
    expect(byIndex.get(6)).toBe(B); // across the horizontal
    expect(byIndex.get(8)).toBe(S); // both: a half turn
    const diagonal = symmetryOrbitKinds(1, 3, 3, axes({ diagonal: true }), S);
    expect(diagonal.every((o) => o.kind === S)).toBe(true);
  });

  it("a symmetric fill puts each region's mirror image in", () => {
    const p = chart(4, 1, "0 0 0 0");
    const filled = fillSymmetric(p, 0, axes({ vertical: true }), 1, 8, S);
    expect(kindsOf(filled, 4)).toEqual([S, S, S, S]); // one region, the first seed's kind
    const split = chart(4, 1, "0 1 1 0");
    const out = fillSymmetric(split, 0, axes({ vertical: true }), 1, 8, S);
    expect(kindsOf(out, 4)).toEqual([S, W, W, B]);
  });

  it("quick mirror reflects the half stitches too", () => {
    const p = chart(4, 1, "0 0 0 0", "s w w w");
    expect(kindsOf(applyQuickMirror(p, "left-half"), 4)).toEqual([S, W, W, B]);
    const q = chart(2, 2, "0 0 0 0", "s w w w");
    expect(kindsOf(applyQuickMirror(q, "upper-left-corner"), 4)).toEqual([S, B, B, S]);
  });
});

describe("saving", () => {
  it("round-trips the kinds, and writes none for a chart without half stitches", () => {
    const p = chart(3, 1, "0 1 .", "s b w");
    const back = deserializePattern(serializePattern(p));
    expect(kindsOf(back, 3)).toEqual([S, B, W]);
    expect(JSON.parse(serializePattern(chart(3, 1, "0 1 0"))).cellKind).toBeUndefined();
  });

  it("opens a file with no kinds, or with kinds it cannot trust, as whole stitches", () => {
    const text = serializePattern(chart(3, 1, "0 1 0", "s w w"));
    const data = JSON.parse(text);
    expect(deserializePattern(JSON.stringify({ ...data, cellKind: undefined })).cellKind).toBeUndefined();
    expect(deserializePattern(JSON.stringify({ ...data, cellKind: [1, 0] })).cellKind).toBeUndefined();
    expect(deserializePattern(JSON.stringify({ ...data, cellKind: [1, 7, 0] })).cellKind).toBeUndefined();
  });
});

describe("counts", () => {
  it("counts the kinds of a thread or of the chart", () => {
    const p = chart(4, 1, "0 0 1 .", "s w b w");
    expect(kindCounts(p)).toEqual([1, 1, 1]);
    expect(kindCounts(p, 0)).toEqual([1, 1, 0]);
    expect(kindCounts(p, 1)).toEqual([0, 0, 1]);
  });
});

describe("the Fill tool's region by colour and stitch type (G-115, D322)", () => {
  // 3 x 3 of thread 0: the middle row is half stitches "/", the rest whole.
  const p = () => chart(3, 3, "0 0 0 / 0 0 0 / 0 0 0", "w w w / s s s / w w w");
  const colours = (q: StitchPattern) => Array.from(q.cellPalette);
  const none = NO_SYMMETRY;

  it("keeps to stitches of the pressed one's type: whole stitches do not spread into half ones of that colour", () => {
    const filled = fillSymmetric(p(), 0, none, 1, 8, W, { sameKind: true });
    expect(colours(filled)).toEqual([1, 1, 1, 0, 0, 0, 0, 0, 0]);
    expect(kindsOf(filled, 9)).toEqual([W, W, W, S, S, S, W, W, W]);
    const halves = fillSymmetric(p(), 4, none, 1, 8, B, { sameKind: true });
    expect(colours(halves)).toEqual([0, 0, 0, 1, 1, 1, 0, 0, 0]);
    expect(kindsOf(halves, 9)).toEqual([W, W, W, B, B, B, W, W, W]);
  });

  it("colour only fills every touching stitch of the colour, of any type, and keeps each stitch's type", () => {
    const filled = fillSymmetric(p(), 0, none, 1, 8, B, { colorOnly: true });
    expect(colours(filled)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(kindsOf(filled, 9)).toEqual([W, W, W, S, S, S, W, W, W]);
  });

  it("colour only into empty leaves whole stitches, and out of empty lays whole stitches", () => {
    const erased = fillSymmetric(p(), 4, none, EMPTY_CELL, 8, W, { colorOnly: true });
    expect(kindsOf(erased, 9)).toEqual([W, W, W, W, W, W, W, W, W]);
    const blank = chart(2, 1, ". .");
    expect(kindsOf(fillSymmetric(blank, 0, none, 1, 8, S, { colorOnly: true }), 2)).toEqual([W, W]);
  });

  it("with diagonal neighbours off, stitches touching only at a corner are another region", () => {
    const corners = chart(3, 3, "0 1 1 / 1 0 1 / 1 1 0");
    expect(colours(fillSymmetric(corners, 0, none, 1, 8, W, { sameKind: true }))).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(colours(fillSymmetric(corners, 0, none, 1, 4, W, { sameKind: true }))).toEqual([1, 1, 1, 1, 0, 1, 1, 1, 0]);
  });

  it("with diagonal neighbours on and colour only, it fills as Fill always did", () => {
    const q = chart(3, 3, "0 1 1 / 1 0 1 / 1 1 0", "w w w / w s w / w w b");
    expect(colours(fillSymmetric(q, 0, none, 1, 8, W, { colorOnly: true }))).toEqual(colours(fillSymmetric(q, 0, none, 1, 8, W)));
  });
});
