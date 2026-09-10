import { describe, expect, it } from "vitest";
import { headerText } from "@/lib/render";
import type { PaletteColor, StitchPattern } from "@/lib/types";

function makePattern(width: number, height: number): StitchPattern {
  const palette: PaletteColor[] = [{ index: 0, rgb: [0, 0, 0], symbol: "0", name: "Black", count: width * height }];
  return { width, height, cellPalette: new Uint8Array(width * height), palette, isLandscape: width >= height };
}

describe("headerText", () => {
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
