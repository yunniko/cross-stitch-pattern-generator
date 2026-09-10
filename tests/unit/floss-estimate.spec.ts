import { describe, expect, it } from "vitest";
import { estimateSkeins, formatSkeinEstimate } from "@/lib/floss-estimate";

describe("estimateSkeins", () => {
  it("returns 0 for a color with no stitches", () => {
    expect(estimateSkeins(0, 14)).toBe(0);
  });

  it("never returns less than 1 skein for any positive stitch count", () => {
    expect(estimateSkeins(1, 14)).toBe(1);
    expect(estimateSkeins(1, 11)).toBe(1);
  });

  it("matches the domain-reference derivation at 14-count (~1370 stitches/skein)", () => {
    expect(estimateSkeins(1369, 14)).toBe(1);
    expect(estimateSkeins(1370, 14)).toBe(2);
  });

  it("needs more skeins per stitch at lower Aida counts (coarser fabric + more strands)", () => {
    const stitches = 2000;
    expect(estimateSkeins(stitches, 11)).toBeGreaterThan(estimateSkeins(stitches, 18));
  });

  it("is monotonically non-decreasing in stitch count for a fixed Aida count", () => {
    let previous = 0;
    for (const stitches of [0, 100, 500, 1000, 2000, 5000, 10000]) {
      const skeins = estimateSkeins(stitches, 16);
      expect(skeins).toBeGreaterThanOrEqual(previous);
      previous = skeins;
    }
  });

  it("always rounds up rather than down, per the product requirement to overestimate", () => {
    // Just one stitch past a whole skein's worth at 14-count still needs a second skein.
    expect(estimateSkeins(1370, 14)).toBe(2);
  });
});

describe("formatSkeinEstimate", () => {
  it("pluralizes correctly", () => {
    expect(formatSkeinEstimate(1, 14)).toBe("1 skein");
    expect(formatSkeinEstimate(2000, 14)).toBe("2 skeins");
    expect(formatSkeinEstimate(0, 14)).toBe("0 skeins");
  });
});
