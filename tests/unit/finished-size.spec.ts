import { describe, expect, it } from "vitest";
import { formatFinishedDimension, formatFinishedSize, stitchesToCm, stitchesToInches } from "@/lib/finished-size";

describe("finished-size", () => {
  it("converts stitches to inches at 14-count", () => {
    expect(stitchesToInches(14)).toBe(1);
    expect(stitchesToInches(50)).toBeCloseTo(3.571, 3);
  });

  it("converts stitches to centimeters via the inch value", () => {
    expect(stitchesToCm(14)).toBeCloseTo(2.54, 5);
  });

  it("formats a single dimension with both units", () => {
    expect(formatFinishedDimension(50)).toBe("3.6 in / 9.1 cm");
  });

  it("formats a width/height pair with both units", () => {
    expect(formatFinishedSize(50, 31)).toBe("3.6 × 2.2 in (9.1 × 5.6 cm)");
  });
});
