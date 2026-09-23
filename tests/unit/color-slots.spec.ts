import { describe, expect, it } from "vitest";
import {
  backgroundOf,
  colorForButton,
  foregroundOf,
  NO_COLORS,
  swapped,
  withActive,
  withColor,
  withColorRemoved,
  type ColorSlots,
} from "@/lib/editor/color-slots";

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
