import { describe, expect, it } from "vitest";
import {
  STANDARD_AIDA_COUNTS,
  formatFinishedDimension,
  formatFinishedSize,
  stitchesToCm,
  stitchesToInches,
} from "@/lib/finished-size";

describe("finished-size", () => {
  it("converts stitches to inches at a given count", () => {
    expect(stitchesToInches(14, 14)).toBe(1);
    expect(stitchesToInches(50, 14)).toBeCloseTo(3.571, 3);
    expect(stitchesToInches(50, 11)).toBeCloseTo(4.545, 3);
  });

  it("converts stitches to centimeters via the inch value", () => {
    expect(stitchesToCm(14, 14)).toBeCloseTo(2.54, 5);
  });

  it("formats a single dimension in the selected unit only", () => {
    expect(formatFinishedDimension(50, 14, "in")).toBe("3.6 in");
    expect(formatFinishedDimension(50, 14, "cm")).toBe("9.1 cm");
  });

  it("formats a width/height pair in the selected unit only", () => {
    expect(formatFinishedSize(50, 31, 14, "in")).toBe("3.6 × 2.2 in");
    expect(formatFinishedSize(50, 31, 14, "cm")).toBe("9.1 × 5.6 cm");
  });

  it("reflects a different fabric count in the estimate", () => {
    expect(formatFinishedDimension(50, 11, "in")).toBe("4.5 in");
  });

  it("exposes the standard Aida counts with 14 as one of them", () => {
    expect(STANDARD_AIDA_COUNTS).toContain(14);
    expect(STANDARD_AIDA_COUNTS.length).toBeGreaterThanOrEqual(4);
  });
});
