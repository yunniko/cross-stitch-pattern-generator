import { describe, expect, it } from "vitest";
import { colorAt } from "@/lib/color/palette";
import type { PaletteColor } from "@/lib/types";

/**
 * G-067 M5: the accessor exists so a bad index says what it was, rather than failing as `undefined.rgb` somewhere
 * inside a canvas loop. It stays strict — nothing here paints around a missing colour (D217).
 */

const PALETTE: PaletteColor[] = [
  { index: 0, rgb: [255, 0, 0], symbol: "A", name: "Red", count: 3 },
  { index: 1, rgb: [0, 0, 40], symbol: "B", name: "Navy", count: 1 },
];

describe("colorAt", () => {
  it("returns the thread at that index", () => {
    expect(colorAt(PALETTE, 0).name).toBe("Red");
    expect(colorAt(PALETTE, 1).symbol).toBe("B");
  });

  it("names the index and the palette when there is no such thread", () => {
    // 254 is the value the D217 crash actually wrote: the empty-stitch sentinel renumbered by one.
    expect(() => colorAt(PALETTE, 254)).toThrow("palette has no colour 254 (the chart has 2)");
  });

  it("refuses rather than inventing a colour, for every way an index can be wrong", () => {
    for (const bad of [2, -1, 255, 1.5]) {
      expect(() => colorAt(PALETTE, bad), `index ${bad}`).toThrow(/palette has no colour/);
    }
  });
});
