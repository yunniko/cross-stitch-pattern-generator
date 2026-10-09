import { describe, expect, it } from "vitest";
import { applyChange, recordChange } from "../../lib/document/change";
import { BASE_LAYER_ID, BASE_LAYER_NAME, documentFromPattern, flatten, newRevision } from "../../lib/document/convert";
import {
  MAX_HISTORY,
  canRedo,
  canUndo,
  commitDocument,
  redoHistory,
  startHistory,
  undoHistory,
  type DocumentHistory,
} from "../../lib/document/history";
import type { StitchLayer } from "../../lib/document/types";
import { EMPTY_CELL, type PaletteColor, type StitchPattern } from "../../lib/types";

/**
 * G-094: the chart as a document, a change between two documents, and the undo history built on changes. The history must
 * mean exactly what the history of full copies meant, so most of this compares it with one.
 */

const palette = (n: number): PaletteColor[] =>
  Array.from({ length: n }, (_, index) => ({
    index,
    rgb: [index, index, index],
    symbol: String.fromCharCode(65 + index),
    name: `c${index}`,
    count: 0,
  }));

function chart(width: number, height: number, fill = 0, extra: Partial<StitchPattern> = {}): StitchPattern {
  return {
    width,
    height,
    cellPalette: new Uint8Array(width * height).fill(fill),
    palette: palette(4),
    isLandscape: width > height,
    ...extra,
  };
}

/** A small generator with a fixed seed, so a failure can be run again. */
function random(seed: number) {
  let state = seed;
  return (below: number) => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state % below;
  };
}

/** What matters of a chart, for comparing two that should be the same chart. */
const shape = (p: StitchPattern | null) =>
  p && {
    width: p.width,
    height: p.height,
    cells: Array.from(p.cellPalette),
    kinds: p.cellKind ? Array.from(p.cellKind) : "absent",
    // A colour's count is of the flattened chart, recounted there (tested above); these fixtures carry none.
    palette: p.palette.map((color) => ({ ...color, count: undefined })),
    name: p.name,
    backstitch: p.backstitch,
    fabric: p.fabric,
  };

describe("a flat chart as a document", () => {
  it("is one layer holding the chart's own planes, and flattens back to the very same chart", () => {
    const pattern = chart(4, 3, 1, {
      name: "A",
      cellKind: new Uint8Array(12),
      backstitch: [{ x1: 0, y1: 0, x2: 1, y2: 1, paletteIndex: 0 }],
    });
    const document = documentFromPattern(pattern);
    expect(document.layers).toHaveLength(1);
    expect(document.layers[0].id).toBe(BASE_LAYER_ID);
    const layer = document.layers[0] as StitchLayer;
    expect(layer).toMatchObject({ kind: "stitches", name: BASE_LAYER_NAME, visible: true });
    expect(layer.cells).toBe(pattern.cellPalette);
    expect(layer.kinds).toBe(pattern.cellKind);
    expect(document.properties).toEqual({ name: "A", isLandscape: true });
    expect(flatten(document)).toBe(pattern);
  });

  it("gives every document a revision of its own", () => {
    const pattern = chart(2, 2);
    expect(documentFromPattern(pattern).revision).not.toBe(documentFromPattern(pattern).revision);
  });

  it("flattens several layers top down: an empty stitch shows the layer below, with its kind, and the counts are of the result", () => {
    const base = documentFromPattern(chart(2, 2, 0, { cellKind: Uint8Array.from([1, 1, 1, 1]) }));
    const upper: StitchLayer = {
      id: "upper",
      kind: "stitches",
      name: "Layer 2",
      visible: true,
      cells: Uint8Array.from([EMPTY_CELL, 2, EMPTY_CELL, 3]),
    };
    const flat = flatten({ ...base, revision: newRevision(), layers: [base.layers[0], upper] });
    expect(Array.from(flat.cellPalette)).toEqual([0, 2, 0, 3]);
    expect(Array.from(flat.cellKind!)).toEqual([1, 0, 1, 0]);
    expect(flat.palette.map((c) => c.count)).toEqual([2, 0, 1, 1]);
    // The layers themselves are not touched.
    expect(Array.from((base.layers[0] as StitchLayer).cells)).toEqual([0, 0, 0, 0]);
  });

  it("refuses a layer that is not the size of its document, by name", () => {
    const base = documentFromPattern(chart(2, 2));
    const short: StitchLayer = { id: "short", kind: "stitches", name: "Short", visible: true, cells: new Uint8Array(3) };
    expect(() => flatten({ ...base, revision: newRevision(), layers: [base.layers[0], short] })).toThrow(
      'The layer "short" is not the size of its document (2 × 2).'
    );
    expect(() => flatten({ ...base, revision: newRevision(), layers: [] })).toThrow("A chart document has no layer.");
  });
});

describe("a recorded change", () => {
  const both = (before: StitchPattern | null, after: StitchPattern | null) => {
    const a = before && documentFromPattern(before);
    const b = after && documentFromPattern(after);
    const change = recordChange(a, b);
    const undone = applyChange(b, change, "undo");
    const redone = applyChange(undone, change, "redo");
    return { change, undone: undone && flatten(undone), redone: redone && flatten(redone), a, b };
  };

  it("keeps only the stitches that differ, and makes either chart from the other", () => {
    const before = chart(100, 100, 1);
    const after = { ...before, cellPalette: new Uint8Array(before.cellPalette) };
    after.cellPalette[5] = 2;
    after.cellPalette[6] = 3;
    after.cellPalette[9000] = 0;
    const { change, undone, redone } = both(before, after);
    expect(change.type).toBe("edit");
    if (change.type !== "edit") return;
    expect(Array.from(change.layers[0].cells!.starts)).toEqual([5, 9000]);
    expect(Array.from(change.layers[0].cells!.lengths)).toEqual([2, 1]);
    expect(change.layers[0].cells!.xor).toHaveLength(3);
    expect(change.fields).toEqual([]);
    expect(shape(undone)).toEqual(shape(before));
    expect(shape(redone)).toEqual(shape(after));
  });

  it("joins differences a few stitches apart into one run, and reads a plane that is not word-aligned", () => {
    const backing = new Uint8Array(64);
    const before = chart(7, 3, 0, { cellPalette: backing.subarray(1, 22) });
    const after = { ...before, cellPalette: new Uint8Array(21) };
    after.cellPalette[2] = 1;
    after.cellPalette[6] = 1;
    after.cellPalette[20] = 3;
    const { change, undone, redone } = both(before, after);
    if (change.type !== "edit") throw new Error("expected an edit");
    expect(Array.from(change.layers[0].cells!.starts)).toEqual([2, 20]);
    expect(Array.from(change.layers[0].cells!.lengths)).toEqual([5, 1]);
    expect(shape(undone)).toEqual(shape(before));
    expect(shape(redone)).toEqual(shape(after));
  });

  it("keeps whether the chart had half stitches at all, either way round", () => {
    const whole = chart(3, 3, 1);
    const halves = chart(3, 3, 1, { cellKind: Uint8Array.from([0, 1, 2, 0, 0, 0, 0, 0, 0]) });
    const allWhole = chart(3, 3, 1, { cellKind: new Uint8Array(9) });
    for (const [before, after] of [
      [whole, halves],
      [halves, whole],
      [whole, allWhole],
      [allWhole, whole],
    ]) {
      const { undone, redone } = both(before, after);
      expect(shape(undone)).toEqual(shape(before));
      expect(shape(redone)).toEqual(shape(after));
    }
  });

  it("keeps a changed palette, backstitch or property as the two values, and a removed one comes back removed", () => {
    const plain = chart(2, 2, 0, { name: "Old", fabric: { count: 14, unit: "cm" } });
    // Counted right, so the flattened chart can hand back the very palette it holds.
    const before = { ...plain, palette: plain.palette.map((color) => ({ ...color, count: color.index === 0 ? 4 : 0 })) };
    const after: StitchPattern = {
      ...before,
      name: "New",
      palette: palette(5),
      backstitch: [{ x1: 0, y1: 0, x2: 2, y2: 2, paletteIndex: 1 }],
    };
    delete after.fabric;
    const { change, undone, redone } = both(before, after);
    if (change.type !== "edit") throw new Error("expected an edit");
    expect(change.layers).toEqual([]);
    expect(change.fields.map((field) => field[0]).sort()).toEqual(["backstitch", "palette", "properties.fabric", "properties.name"]);
    expect(shape(undone)).toEqual(shape(before));
    expect(undone!.palette).toBe(before.palette);
    expect(shape(redone)).toEqual(shape(after));
    expect("fabric" in redone!).toBe(false);
    expect("backstitch" in undone!).toBe(false);
  });

  it("keeps both documents when the size changes, or there is no chart on one side", () => {
    const small = chart(2, 2);
    const large = chart(3, 2);
    expect(both(small, large).change.type).toBe("replace");
    expect(both(null, small).change.type).toBe("replace");
    const { undone, redone, a, b } = both(small, null);
    expect(undone).toBe(flatten(a!));
    expect(redone).toBe(b);
  });

  it("refuses to be applied to a document it does not belong to", () => {
    const a = documentFromPattern(chart(2, 2));
    const b = documentFromPattern(chart(2, 2, 1));
    const stranger = documentFromPattern(chart(2, 2, 2));
    expect(() => applyChange(stranger, recordChange(a, b), "undo")).toThrow(/does not belong to/);
  });
});

describe("the history of changes, against a history of full copies", () => {
  /** The oracle: every state kept whole, as the history did before G-094. */
  interface Copies {
    entries: (StitchPattern | null)[];
    index: number;
  }
  const present = (h: DocumentHistory) => (h.present ? flatten(h.present) : null);

  it("means the same through 400 random edits, undos, redos, renames, resizes and new charts", () => {
    const next = random(20261005);
    let pattern: StitchPattern | null = chart(40, 30, 0);
    let history = startHistory(documentFromPattern(pattern));
    let copies: Copies = { entries: [pattern], index: 0 };

    for (let step = 0; step < 400; step++) {
      const roll = next(20);
      const current: StitchPattern | null = copies.entries[copies.index];
      if (roll < 4) {
        history = undoHistory(history);
        copies = { ...copies, index: Math.max(0, copies.index - 1) };
      } else if (roll < 7) {
        history = redoHistory(history);
        copies = { ...copies, index: Math.min(copies.entries.length - 1, copies.index + 1) };
      } else {
        let edited: StitchPattern | null;
        if (roll === 7) edited = current ? { ...current, name: `n${step}` } : chart(10, 10);
        else if (roll === 8) edited = chart(5 + next(40), 5 + next(40), next(4));
        else if (roll === 9) edited = next(4) === 0 ? null : (current ?? chart(8, 8));
        else if (!current) edited = chart(12, 12, 1);
        else {
          const cells = new Uint8Array(current.cellPalette);
          const kinds = current.cellKind ? new Uint8Array(current.cellKind) : roll > 16 ? new Uint8Array(cells.length) : undefined;
          for (let k = 0, n = 1 + next(60); k < n; k++) {
            const at = next(cells.length);
            cells[at] = next(5) === 0 ? EMPTY_CELL : next(4);
            if (kinds) kinds[at] = next(3);
          }
          edited = { ...current, cellPalette: cells, ...(kinds ? { cellKind: kinds } : {}) };
          if (roll === 16) delete edited.cellKind;
        }
        if (edited === current) continue;
        history = commitDocument(history, edited && documentFromPattern(edited));
        const entries = [...copies.entries.slice(0, copies.index + 1), edited].slice(-MAX_HISTORY);
        copies = { entries, index: entries.length - 1 };
      }
      expect(shape(present(history)), `step ${step}`).toEqual(shape(copies.entries[copies.index]));
      expect(canUndo(history), `step ${step}`).toBe(copies.index > 0);
      expect(canRedo(history), `step ${step}`).toBe(copies.index < copies.entries.length - 1);
    }
    pattern = present(history);
    expect(pattern === null || pattern.width > 0).toBe(true);
  });

  it("keeps at most the cap of steps, dropping the oldest", () => {
    let history = startHistory(documentFromPattern(chart(3, 3)));
    for (let i = 0; i < 80; i++) history = commitDocument(history, documentFromPattern(chart(3, 3, 0, { name: `s${i}` })));
    expect(history.past).toHaveLength(MAX_HISTORY - 1);
    for (let i = 0; i < 80; i++) history = undoHistory(history);
    expect(present(history)!.name).toBe("s30");
    expect(canUndo(history)).toBe(false);
  });

  it("hands back the very chart that was committed, and after an undo and redo one that is equal to it", () => {
    const first = chart(3, 3);
    const second = chart(3, 3, 1);
    let history = commitDocument(startHistory(documentFromPattern(first)), documentFromPattern(second));
    expect(present(history)).toBe(second);
    history = redoHistory(undoHistory(history));
    expect(shape(present(history))).toEqual(shape(second));
  });
});
