import { describe, expect, it } from "vitest";
import { gridDimensionsFor } from "@/lib/pipeline/grid-dimensions";

describe("gridDimensionsFor", () => {
  it("puts the requested stitch count on the longer side and preserves aspect ratio", () => {
    expect(gridDimensionsFor(200, 100, 50)).toEqual({ width: 50, height: 25 });
    expect(gridDimensionsFor(100, 200, 50)).toEqual({ width: 25, height: 50 });
  });

  it("never produces a zero-length side for extreme aspect ratios", () => {
    expect(gridDimensionsFor(2000, 10, 50).height).toBeGreaterThanOrEqual(1);
  });

  it("treats a square image as width === height", () => {
    expect(gridDimensionsFor(300, 300, 60)).toEqual({ width: 60, height: 60 });
  });

  it("rounds a fractional longerSideStitches to an integer, on the primary side too (code-review 2026-09-09, finding 8)", () => {
    // The old bug: only the *derived* shorter side was rounded; the primary
    // (longer) side was used exactly as given, so a fractional value like
    // 10.5 flowed straight through as a real dimension -- reaching typed-
    // array allocations downstream that throw for a non-integer length.
    const result = gridDimensionsFor(200, 100, 10.5);
    expect(Number.isInteger(result.width)).toBe(true);
    expect(Number.isInteger(result.height)).toBe(true);
  });

  it("never returns a non-integer dimension for any finite input", () => {
    for (const stitches of [10.1, 10.9, 99.99, 500.5]) {
      const result = gridDimensionsFor(160, 90, stitches);
      expect(Number.isInteger(result.width)).toBe(true);
      expect(Number.isInteger(result.height)).toBe(true);
    }
  });
});
