import { describe, expect, it } from "vitest";
import {
  backgroundOf,
  colorForButton,
  foregroundOf,
  NO_COLORS,
  paintableIndex,
  swapped,
  withActive,
  withColor,
  withColorRemoved,
  type ColorSlots,
} from "@/lib/editor/color-slots";
import { EMPTY_CELL } from "@/lib/types";

/** G-064 M1: the two colours a chart is drawn with, and the rules the Owner set for them on 2026-09-23. */

const slots = (a: number | null, b: number | null, active: "a" | "b" = "a"): ColorSlots => ({ a, b, active });

describe("the two colour slots", () => {
  it("starts holding nothing, as a chart nobody has picked from does", () => {
    expect(foregroundOf(NO_COLORS)).toBeNull();
    expect(backgroundOf(NO_COLORS)).toBeNull();
  });

  it("paints with the foreground on a left button and the background on a right one", () => {
    const both = slots(3, 7);

    expect(colorForButton(both, 0)).toBe(3);
    expect(colorForButton(both, 2)).toBe(7);
    // A middle button is not a right button, so it paints as a left one does.
    expect(colorForButton(both, 1)).toBe(3);
  });

  it("makes the square that was behind the foreground, without moving either colour", () => {
    const before = slots(3, 7, "a");
    const after = withActive(before, "b");

    expect(after.a).toBe(3);
    expect(after.b).toBe(7);
    expect(foregroundOf(after)).toBe(7);
    expect(backgroundOf(after)).toBe(3);
  });

  it("picking a background colour leaves the active square alone", () => {
    const before = slots(3, 7, "a");
    const after = withColor(before, "background", 9);

    expect(after.active).toBe("a");
    expect(foregroundOf(after), "the brush is still holding what it was").toBe(3);
    expect(backgroundOf(after)).toBe(9);
  });

  it("picking a foreground colour fills whichever square is in front", () => {
    expect(foregroundOf(withColor(slots(3, 7, "a"), "foreground", 5))).toBe(5);
    expect(foregroundOf(withColor(slots(3, 7, "b"), "foreground", 5))).toBe(5);
    // And leaves the other one holding what it held.
    expect(backgroundOf(withColor(slots(3, 7, "b"), "foreground", 5))).toBe(3);
  });

  it("swaps the roles without moving the colours", () => {
    const after = swapped(slots(3, 7, "a"));

    expect({ a: after.a, b: after.b }).toEqual({ a: 3, b: 7 });
    expect(foregroundOf(after)).toBe(7);
  });

  it("forgets a colour that was removed, and renumbers the ones above it", () => {
    // Merging thread 2 away shifts 3 and 4 down to 2 and 3; a square still pointing at 3 would otherwise be
    // holding a different thread than the reader picked.
    const after = withColorRemoved(slots(4, 2), 2);

    expect(after.a, "4 became 3 when 2 left").toBe(3);
    expect(after.b, "the removed colour is no longer held").toBeNull();
  });

  it("leaves colours below the removed one where they are", () => {
    expect(withColorRemoved(slots(1, 0), 5)).toEqual(slots(1, 0));
    expect(withColorRemoved(slots(null, null), 0)).toEqual(slots(null, null));
  });
});

/**
 * D217: the empty stitch is a sentinel, not a palette index. Renumbering it after a merge turned 255 into 254, and
 * the next press wrote a cell the renderer could not draw -- which threw inside the pointer handler and took the
 * whole page down, since there is no error boundary under it.
 */
describe("the empty stitch through a merge", () => {
  it("is not renumbered, whichever colour was merged away", () => {
    const holding = { a: EMPTY_CELL, b: 3, active: "a" as const };
    for (const removed of [0, 1, 2, 3, 7, 200]) {
      expect(withColorRemoved(holding, removed).a, `merged ${removed}`).toBe(EMPTY_CELL);
    }
  });

  it("still renumbers the real threads beside it", () => {
    const after = withColorRemoved({ a: EMPTY_CELL, b: 5, active: "a" }, 2);
    expect(after.a).toBe(EMPTY_CELL);
    expect(after.b).toBe(4);
  });
});

describe("paintableIndex", () => {
  it("keeps a thread the palette has, and the empty stitch always", () => {
    expect(paintableIndex(0, 4)).toBe(0);
    expect(paintableIndex(3, 4)).toBe(3);
    expect(paintableIndex(EMPTY_CELL, 4)).toBe(EMPTY_CELL);
    expect(paintableIndex(EMPTY_CELL, 0), "an empty palette still takes empty stitches").toBe(EMPTY_CELL);
    expect(paintableIndex(null, 4)).toBeNull();
  });

  it("is nothing to paint with when the palette no longer has that thread", () => {
    // What a merge leaves behind if something renumbers a held index wrongly: better to paint nothing than to write
    // a cell no renderer can draw.
    expect(paintableIndex(4, 4)).toBeNull();
    expect(paintableIndex(254, 16)).toBeNull();
    expect(paintableIndex(-1, 4)).toBeNull();
  });
});
