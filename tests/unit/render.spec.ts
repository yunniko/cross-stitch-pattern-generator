import { describe, expect, it } from "vitest";
import { headerText } from "@/lib/export/render";
import { EMPTY_CELL, type PaletteColor, type StitchPattern } from "@/lib/types";

function makePattern(width: number, height: number, emptyCells = 0): StitchPattern {
  const cellPalette = new Uint8Array(width * height);
  cellPalette.fill(EMPTY_CELL, 0, emptyCells);
  const palette: PaletteColor[] = [{ index: 0, rgb: [0, 0, 0], symbol: "0", name: "Black", count: width * height - emptyCells }];
  return { width, height, cellPalette, palette, isLandscape: width >= height };
}

describe("headerText", () => {
  it("shows the canvas grid and counts only filled stitches (D120)", () => {
    expect(headerText(makePattern(60, 40), 14, "in")).toMatch(/^60 × 40 grid, 2,400 stitches — approx\. /);
    const withEmpty = headerText(makePattern(60, 40, 400), 14, "in");
    expect(withEmpty).toMatch(/^60 × 40 grid, 2,000 stitches — approx\. /);
    expect(withEmpty).toContain(headerText(makePattern(60, 40), 14, "in").split(" — ")[1]);
  });

  it("reports the finished size in the requested unit (G-015: must follow the Options unit, not a hardcoded default)", () => {
    const pattern = makePattern(140, 140);
    expect(headerText(pattern, 14, "in")).toContain("10.0 in");
    expect(headerText(pattern, 14, "cm")).toContain("25.4 cm");
  });

  it("omits the author credit when authorName is absent, blank, or whitespace-only", () => {
    const pattern = makePattern(10, 10);
    expect(headerText(pattern, 14, "in")).not.toContain("Designed by");
    expect(headerText(pattern, 14, "in", "")).not.toContain("Designed by");
    expect(headerText(pattern, 14, "in", "   ")).not.toContain("Designed by");
  });

  it("appends a trimmed 'Designed by' credit when authorName is set (G-015)", () => {
    const pattern = makePattern(10, 10);
    expect(headerText(pattern, 14, "in", "  Julie N.  ")).toMatch(/Designed by Julie N\.$/);
  });
});
