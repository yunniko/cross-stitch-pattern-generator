// G-094: what undo costs at the largest chart, measured rather than assumed.
// A chart of SIZE × SIZE gets fifty edits (the history's cap), each a stroke of a few hundred stitches, then is undone to
// the start and redone to the end. Reported: memory held by the history, and the time of a commit, an undo and a redo.
//
//   npx tsx --expose-gc scripts/measure-undo.ts snapshot    the history of full copies (before G-094)
//   npx tsx --expose-gc scripts/measure-undo.ts document    the history of recorded changes (lib/document)
//   add "kinds" to give the chart half stitches (a second plane), "fill" to make every edit repaint a third of the chart
import { performance } from "node:perf_hooks";
import { withCellPalette } from "../lib/editor/pattern-edit";
import type { StitchLayer } from "../lib/document/types";
import type { StitchPattern } from "../lib/types";

/** The history of full copies, as `lib/editor/undo-history.ts` kept it until G-094 replaced it: here so "before" can be measured again. */
interface HistoryState<T> {
  entries: T[];
  index: number;
}
function pushHistory<T>(prev: HistoryState<T>, next: T): HistoryState<T> {
  let entries = [...prev.entries.slice(0, prev.index + 1), next];
  let index = prev.index + 1;
  if (entries.length > 50) {
    const overflow = entries.length - 50;
    entries = entries.slice(overflow);
    index -= overflow;
  }
  return { entries, index };
}

const SIZE = 1500;
const STEPS = 50;
const mode = process.argv[2] ?? "snapshot";
const withKinds = process.argv.includes("kinds");
const bigEdits = process.argv.includes("fill");

function gcNow(): void {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (!gc) throw new Error("Run with --expose-gc.");
  gc();
  gc();
}
const held = () => {
  gcNow();
  const m = process.memoryUsage();
  return m.arrayBuffers + m.heapUsed;
};
const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
const ms = (list: number[]) => {
  const sorted = [...list].sort((a, b) => a - b);
  return `median ${sorted[Math.floor(sorted.length / 2)].toFixed(2)} ms, worst ${sorted[sorted.length - 1].toFixed(2)} ms`;
};

function startChart(): StitchPattern {
  const cells = new Uint8Array(SIZE * SIZE);
  for (let i = 0; i < cells.length; i++) cells[i] = (i * 7) % 16;
  const palette = Array.from({ length: 16 }, (_, index) => ({
    index,
    rgb: [index * 16, 128, 255 - index * 16] as [number, number, number],
    symbol: String.fromCharCode(65 + index),
    name: `Colour ${index}`,
    count: 0,
  }));
  return {
    width: SIZE,
    height: SIZE,
    cellPalette: cells,
    cellKind: withKinds ? new Uint8Array(SIZE * SIZE) : undefined,
    palette,
    isLandscape: false,
  };
}

/** One edit, as a tool makes it: a copy of the planes with some stitches changed. */
function edit(pattern: StitchPattern, step: number): StitchPattern {
  const cells = new Uint8Array(pattern.cellPalette);
  const kinds = pattern.cellKind ? new Uint8Array(pattern.cellKind) : undefined;
  if (bigEdits) {
    const from = ((step * 97) % SIZE) * SIZE;
    for (let i = 0; i < (SIZE * SIZE) / 3; i++) cells[(from + i) % cells.length] = (step + 1) % 16;
  } else {
    // A diagonal stroke three stitches wide, 300 long.
    const x0 = (step * 131) % (SIZE - 310);
    const y0 = (step * 71) % (SIZE - 310);
    for (let t = 0; t < 300; t++) {
      for (let w = 0; w < 3; w++) {
        const index = (y0 + t) * SIZE + x0 + t + w;
        cells[index] = (cells[index] + 1 + step) % 16;
        if (kinds) kinds[index] = (step % 2) + 1;
      }
    }
  }
  return withCellPalette(pattern, cells, kinds);
}

async function main() {
  const first = startChart();
  const base = held();
  const commit: number[] = [];
  const undo: number[] = [];
  const redo: number[] = [];
  let historyBytes = 0;
  let end: StitchPattern | null = null;

  if (mode === "snapshot") {
    let history: HistoryState<StitchPattern> = { entries: [first], index: 0 };
    let current = first;
    for (let step = 0; step < STEPS; step++) {
      const next = edit(current, step);
      const t = performance.now();
      history = pushHistory(history, next);
      commit.push(performance.now() - t);
      current = next;
    }
    historyBytes = held() - base;
    for (let step = 0; step < STEPS - 1; step++) {
      const t = performance.now();
      history = { ...history, index: history.index - 1 };
      undo.push(performance.now() - t);
    }
    for (let step = 0; step < STEPS - 1; step++) {
      const t = performance.now();
      history = { ...history, index: history.index + 1 };
      redo.push(performance.now() - t);
    }
    end = history.entries[history.index];
  } else {
    const { documentFromPattern, flatten } = await import("../lib/document/convert");
    const { startHistory, commitDocument, undoHistory, redoHistory } = await import("../lib/document/history");
    let history = startHistory(documentFromPattern(first));
    let current = first;
    for (let step = 0; step < STEPS; step++) {
      const next = edit(current, step);
      const t = performance.now();
      history = commitDocument(history, documentFromPattern(next));
      commit.push(performance.now() - t);
      current = next;
    }
    // The tool lets go of its copies; what stays is what the history holds.
    current = first;
    historyBytes = held() - base;
    for (let step = 0; step < STEPS - 1; step++) {
      const t = performance.now();
      history = undoHistory(history);
      undo.push(performance.now() - t);
    }
    for (let step = 0; step < STEPS - 1; step++) {
      const t = performance.now();
      history = redoHistory(history);
      redo.push(performance.now() - t);
    }
    end = history.present ? flatten(history.present) : null;

    const one = history.present!;
    const t1 = performance.now();
    for (let i = 0; i < 100; i++) flatten(one);
    console.log(`flatten, one layer (cached): ${((performance.now() - t1) / 100).toFixed(4)} ms`);
    const bottom = one.layers[0] as StitchLayer;
    const two = { ...one, layers: [bottom, { ...bottom, id: "second", cells: new Uint8Array(bottom.cells) }] };
    const times: number[] = [];
    for (let i = 0; i < 10; i++) {
      const t = performance.now();
      flatten({ ...two });
      times.push(performance.now() - t);
    }
    console.log(`flatten, two layers: ${ms(times)}`);
  }

  let checksum = 0;
  for (const value of end!.cellPalette) checksum = (checksum * 31 + value) >>> 0;
  console.log(`${mode}${withKinds ? " + half stitches" : ""}${bigEdits ? ", large edits" : ""}: ${SIZE} × ${SIZE}, ${STEPS} edits`);
  console.log(`held by the history: ${mb(historyBytes)} MB`);
  console.log(`commit: ${ms(commit)}`);
  console.log(`undo:   ${ms(undo)}`);
  console.log(`redo:   ${ms(redo)}`);
  console.log(`final chart checksum: ${checksum}`);
}

void main();
