import { describe, expect, it } from "vitest";
import { DEFAULT_BLUR_RADIUS, DEFAULT_TAU } from "@/lib/pipeline/pair-edge-evidence";
import { buildPattern } from "@/lib/pipeline/pattern";
import { makeGradientShapeBuffer, shapes } from "./shape-fixtures";

// G-035 M3: pair-evidence overrides for a capped photo's calibration profile. Unset or explicit defaults must give
// today's output, and values the evidence loops can't handle are rejected up front.
describe("buildPattern pairEvidenceOptions", () => {
  const buffer = makeGradientShapeBuffer(96, 72, shapes.circle, 0.02, [40, 40, 45], [230, 220, 200]);
  const base = { longerSideStitches: 48, colorCount: 6 };

  it("explicit defaults produce exactly the unset output", () => {
    const unset = buildPattern(buffer, base);
    const explicit = buildPattern(buffer, { ...base, pairEvidenceOptions: { tau: DEFAULT_TAU, blurRadius: DEFAULT_BLUR_RADIUS } });
    expect(Array.from(explicit.cellPalette)).toEqual(Array.from(unset.cellPalette));
    expect(explicit.palette).toEqual(unset.palette);
  });

  it("a different tau reaches the evidence", () => {
    const unset = buildPattern(buffer, base);
    const smooth = buildPattern(buffer, { ...base, pairEvidenceOptions: { tau: 10 } });
    expect(Array.from(smooth.cellPalette)).not.toEqual(Array.from(unset.cellPalette));
  });

  it.each([0, -0.01, Number.NaN, Number.POSITIVE_INFINITY])("rejects tau %s", (tau) => {
    expect(() => buildPattern(buffer, { ...base, pairEvidenceOptions: { tau } })).toThrow(RangeError);
  });

  it.each([-1, 1.5, Number.NaN])("rejects blur radius %s", (blurRadius) => {
    expect(() => buildPattern(buffer, { ...base, pairEvidenceOptions: { blurRadius } })).toThrow(RangeError);
  });

  it("accepts a blur radius of 0", () => {
    expect(() => buildPattern(buffer, { ...base, pairEvidenceOptions: { blurRadius: 0 } })).not.toThrow();
  });
});
