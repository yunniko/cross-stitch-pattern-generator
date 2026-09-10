import { describe, expect, it } from "vitest";
import { renderNavigatorPixels } from "@/lib/render";
import type { PaletteColor, StitchPattern } from "@/lib/types";

function makePattern(): StitchPattern {
  const palette: PaletteColor[] = [
    { index: 0, rgb: [255, 0, 0], symbol: "x", name: "Red", count: 1 },
    { index: 1, rgb: [0, 0, 255], symbol: "0", name: "Blue", count: 1 },
  ];
  return {
    width: 2,
    height: 1,
    cellPalette: Uint8Array.from([0, 1]),
    palette,
    isLandscape: true,
  };
}

describe("renderNavigatorPixels", () => {
  it("writes one opaque RGBA pixel per cell, at true scale (no grid/symbols)", () => {
    const pixels = renderNavigatorPixels(makePattern());
    expect(pixels.length).toBe(2 * 1 * 4);
    expect(Array.from(pixels.slice(0, 4))).toEqual([255, 0, 0, 255]);
    expect(Array.from(pixels.slice(4, 8))).toEqual([0, 0, 255, 255]);
  });
});
