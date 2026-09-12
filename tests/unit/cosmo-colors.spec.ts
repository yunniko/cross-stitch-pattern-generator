import { describe, expect, it } from "vitest";
import { COSMO_COLORS } from "@/lib/cosmo-colors";

describe("COSMO_COLORS", () => {
  it("has 500 colors (the full 2020 Cosmo 500-color line), all with unique codes", () => {
    expect(COSMO_COLORS).toHaveLength(500);
    expect(new Set(COSMO_COLORS.map((c) => c.code)).size).toBe(500);
  });

  it("has an empty name for every entry -- Cosmo has no published descriptive names (docs/cosmo-colors-provenance.md)", () => {
    expect(COSMO_COLORS.every((c) => c.name === "")).toBe(true);
  });

  it("includes a known reference color at its known value (600 = near-black, matching the documented Cosmo numbering)", () => {
    expect(COSMO_COLORS.find((c) => c.code === "600")?.rgb).toEqual([16, 17, 19]);
  });

  it("has no exact pure white or pure black -- plausible for a real physical thread line, unlike a fabricated dataset", () => {
    expect(COSMO_COLORS.some((c) => c.rgb[0] === 255 && c.rgb[1] === 255 && c.rgb[2] === 255)).toBe(false);
    expect(COSMO_COLORS.some((c) => c.rgb[0] === 0 && c.rgb[1] === 0 && c.rgb[2] === 0)).toBe(false);
  });

  it("every RGB channel is a valid 0-255 integer", () => {
    for (const color of COSMO_COLORS) {
      for (const channel of color.rgb) {
        expect(Number.isInteger(channel)).toBe(true);
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(255);
      }
    }
  });
});
