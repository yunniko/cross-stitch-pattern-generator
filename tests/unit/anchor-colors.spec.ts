import { describe, expect, it } from "vitest";
import { ANCHOR_COLORS, DMC_TO_ANCHOR } from "@/lib/anchor-colors";
import { DMC_COLORS } from "@/lib/dmc-colors";

describe("DMC_TO_ANCHOR", () => {
  it("has exactly one entry per real DMC code -- exact 1:1 coverage with DMC_COLORS, no missing or extra codes", () => {
    const dmcCodes = new Set(DMC_COLORS.map((c) => c.code));
    const mapCodes = new Set(Object.keys(DMC_TO_ANCHOR));
    expect(mapCodes.size).toBe(dmcCodes.size);
    for (const code of dmcCodes) expect(mapCodes.has(code)).toBe(true);
  });

  it("matches well-known, independently-verifiable DMC-to-Anchor equivalences", () => {
    expect(DMC_TO_ANCHOR["310"]).toBe("403"); // DMC Black -> Anchor 403, widely cited
    expect(DMC_TO_ANCHOR["666"]).toBe("46"); // DMC Bright Red -> Anchor 46, widely cited
  });

  it("has real many-to-one collisions (multiple DMC codes sharing one Anchor code), not a fabricated clean 1:1 mapping", () => {
    const anchorCodes = Object.values(DMC_TO_ANCHOR);
    const uniqueAnchorCodes = new Set(anchorCodes);
    expect(uniqueAnchorCodes.size).toBeLessThan(anchorCodes.length);
  });
});

describe("ANCHOR_COLORS", () => {
  it("has one entry per unique Anchor code in DMC_TO_ANCHOR's values", () => {
    const uniqueAnchorCodes = new Set(Object.values(DMC_TO_ANCHOR));
    expect(ANCHOR_COLORS).toHaveLength(uniqueAnchorCodes.size);
    expect(new Set(ANCHOR_COLORS.map((c) => c.code))).toEqual(uniqueAnchorCodes);
  });

  it("has an empty name for every entry -- Anchor has no published descriptive names either (docs/anchor-colors-provenance.md)", () => {
    expect(ANCHOR_COLORS.every((c) => c.name === "")).toBe(true);
  });
});
