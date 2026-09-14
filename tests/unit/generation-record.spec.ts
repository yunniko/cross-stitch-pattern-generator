import { describe, expect, it } from "vitest";
import { serializePattern } from "@/lib/editor/pattern-serialize";
import type { StitchPattern } from "@/lib/types";

describe("GenerationRecord (G-035 M3)", () => {
  it("is never written into a saved pattern file", () => {
    const pattern: StitchPattern = {
      width: 1,
      height: 1,
      cellPalette: Uint8Array.from([0]),
      palette: [{ index: 0, rgb: [10, 20, 30], symbol: "A", name: "Blue", count: 1 }],
      isLandscape: false,
      generation: { sourceWidth: 200, sourceHeight: 150, requestedPixelsPerStitch: 2, capped: true, durationMs: 42 },
    };
    const saved = JSON.parse(serializePattern(pattern)) as Record<string, unknown>;
    expect(saved).not.toHaveProperty("generation");
  });
});
