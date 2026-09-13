import { describe, expect, it } from "vitest";
import { compareSwatch, describeDifference, describeSwatchComparison, roundDifferencePoints } from "@/lib/color/swatch-comparison";

/** G-033: the swatch comparison readout's rounding and wording. */

describe("roundDifferencePoints", () => {
  it.each([
    [0.0049, 0],
    [0.005, 1],
    [-0.0049, 0],
    [-0.005, -1],
    [0.1249, 12],
    [-0.125, -13],
    [0, 0],
  ])("rounds a %s difference to %s points, half away from zero", (fraction, points) => {
    expect(roundDifferencePoints(fraction)).toBe(points);
  });
});

describe("describeDifference", () => {
  it.each([
    [{ lightness: 0, saturation: 0 }, ""],
    [{ lightness: 12, saturation: -5 }, "12% lighter, 5% less saturated"],
    [{ lightness: -3, saturation: 0 }, "3% darker"],
    [{ lightness: 0, saturation: 7 }, "7% more saturated"],
    [{ lightness: -1, saturation: 1 }, "1% darker, 1% more saturated"],
  ])("words %j as %j", (difference, text) => {
    expect(describeDifference(difference)).toBe(text);
  });
});

describe("describeSwatchComparison", () => {
  it("shows only the name when the candidate matches the current colour", () => {
    expect(describeSwatchComparison("DMC 310 - Black", [0, 0, 0], [0, 0, 0])).toBe("DMC 310 - Black");
  });

  it("compares lightness and saturation in Okhsl, not HSL", () => {
    expect(describeSwatchComparison("White", [0, 0, 0], [255, 255, 255])).toBe("White: 100% lighter");
    // Pure yellow is far lighter than pure blue in Okhsl (HSL would call them equally light), both fully saturated.
    const yellowVsBlue = compareSwatch([0, 0, 255], [255, 255, 0]);
    expect(yellowVsBlue.lightness).toBeGreaterThan(50);
    expect(yellowVsBlue.saturation).toBe(0);
    // A near-black colour isn't read as fully saturated.
    expect(compareSwatch([128, 128, 128], [20, 10, 10]).saturation).toBeLessThan(50);
  });
});
