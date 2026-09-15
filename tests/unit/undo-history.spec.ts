import { describe, expect, it } from "vitest";
import { pushHistory, replaceSinceHistory, type HistoryState } from "@/lib/editor/use-undo-history";

/** G-037 M2 (D138): a brush double-click fill replaces its two click commits with one step. */

type Entry = { name: string };
const e = (name: string): Entry => ({ name });

function build(entries: Entry[], index = entries.length - 1): HistoryState<Entry> {
  return { entries, index };
}

const undo = (h: HistoryState<Entry>) => ({ ...h, index: Math.max(0, h.index - 1) });
const redo = (h: HistoryState<Entry>) => ({ ...h, index: Math.min(h.entries.length - 1, h.index + 1) });

describe("replaceSinceHistory", () => {
  it("rewinds to the pre-click pattern and adds the fill as one step: one undo returns before the first click", () => {
    const [start, before, click1, click2, fill] = [e("start"), e("before"), e("click1"), e("click2"), e("fill")];
    const next = replaceSinceHistory(build([start, before, click1, click2]), before, [click1, click2], fill);
    expect(next.entries).toEqual([start, before, fill]);
    expect(next.entries[next.index]).toBe(fill);
    const undone = undo(next);
    expect(undone.entries[undone.index]).toBe(before);
    const redone = redo(undone);
    expect(redone.entries[redone.index]).toBe(fill);
  });

  it("compares entries by identity, not by content", () => {
    const [before, click1, click2, fill] = [e("before"), e("click"), e("click"), e("fill")];
    const lookalike = e("click");
    const next = replaceSinceHistory(build([before, click1, click2]), before, [click1, lookalike], fill);
    expect(next.entries).toEqual([before, click1, click2, fill]);
  });

  it("adds the fill as an ordinary step when the pre-click pattern was trimmed away", () => {
    const [click1, click2, fill] = [e("click1"), e("click2"), e("fill")];
    const trimmedAnchor = e("before");
    const next = replaceSinceHistory(build([click1, click2]), trimmedAnchor, [click1, click2], fill);
    expect(next.entries).toEqual([click1, click2, fill]);
    expect(next.index).toBe(2);
  });

  it("adds the fill as an ordinary step when an unrelated edit came in between", () => {
    const [before, click1, other, click2, fill] = [e("before"), e("click1"), e("other"), e("click2"), e("fill")];
    const next = replaceSinceHistory(build([before, click1, other, click2]), before, [click1, click2], fill);
    expect(next.entries).toEqual([before, click1, other, click2, fill]);
  });

  it("adds the fill as an ordinary step after an undo past the clicks, dropping the redo entries like any edit", () => {
    const [before, click1, click2, fill] = [e("before"), e("click1"), e("click2"), e("fill")];
    const undone = build([before, click1, click2], 1);
    const next = replaceSinceHistory(undone, before, [click1, click2], fill);
    expect(next.entries).toEqual([before, click1, fill]);
    expect(next.entries[next.index]).toBe(fill);
  });

  it("works with a single click commit and keeps pushHistory behaviour for plain steps", () => {
    const [before, click, fill] = [e("before"), e("click"), e("fill")];
    expect(replaceSinceHistory(build([before, click]), before, [click], fill).entries).toEqual([before, fill]);
    const pushed = pushHistory(build([before]), click);
    expect(pushed).toEqual({ entries: [before, click], index: 1 });
  });

  it("trims to the history cap when it falls back to an ordinary step", () => {
    const entries = Array.from({ length: 50 }, (_, i) => e(`s${i}`));
    const fill = e("fill");
    const next = replaceSinceHistory(build(entries), e("gone"), [entries[48], entries[49]], fill);
    expect(next.entries).toHaveLength(50);
    expect(next.entries[49]).toBe(fill);
    expect(next.entries[0]).toBe(entries[1]);
  });
});
