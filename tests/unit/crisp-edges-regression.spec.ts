import { describe, expect, it } from "vitest";
import { buildPattern } from "@/lib/pattern";
import { downsampleToGrid } from "@/lib/downsample";
import { makeHardSplitBuffer, makeHardSplitWithGenuineGrayBuffer } from "./crisp-edges-fixtures";

/**
 * G-024 M1 (HANDOVER.md D57): permanent regression fixtures formalizing
 * the Crisp Edges design report's own reproduction, locking in TODAY's
 * real (buggy) baseline -- golden-fixture philosophy, same as `regression
 * .spec.ts`/`shape-regression.spec.ts`/D51's "KNOWN GAP" precedent:
 * measure and document the actual current behavior, not an aspiration,
 * so later milestones (M2-M4) have a precise, numeric contract to fix
 * against and these same tests to tighten once they do.
 */

describe("headline reproduction: a hard black/white split manufactures a gray stitch that doesn't exist in the source", () => {
  it("matches the design report's own exact reported numbers", () => {
    // 64x64 opaque split at x=30, downsampled to 16 stitches, 3 requested
    // colors -- the report's own worked example, verbatim.
    const buffer = makeHardSplitBuffer(64, 64, 30);
    const pattern = buildPattern(buffer, { longerSideStitches: 16, colorCount: 3 });
    const cells = downsampleToGrid(buffer, pattern.width, pattern.height);

    // Column 7 (0-indexed) covers source x in [28,32) -- straddles the
    // split exactly half black, half white.
    const col7 = Array.from(cells.data.slice(7 * 3, 7 * 3 + 3));
    expect(col7).toEqual([188, 188, 188]);

    const byRgb = new Map(pattern.palette.map((p) => [p.rgb.join(","), p.count]));
    expect(byRgb.get("0,0,0")).toBe(112);
    expect(byRgb.get("188,188,188")).toBe(16);
    expect(byRgb.get("255,255,255")).toBe(128);
    expect(pattern.palette).toHaveLength(3);
  });

  it("the manufactured gray is not noise or an artifact -- it appears at every requested color count above 2, always near the boundary's own linear-blend value", () => {
    const buffer = makeHardSplitBuffer(64, 64, 30);
    for (const colorCount of [3, 4, 5]) {
      const pattern = buildPattern(buffer, { longerSideStitches: 16, colorCount });
      const grayEntries = pattern.palette.filter((p) => p.rgb[0] > 20 && p.rgb[0] < 235);
      expect(grayEntries.length).toBeGreaterThan(0);
      // Every manufactured gray sits close to the true 50/50 blend
      // (188ish for straight linear-light averaging of black/white,
      // exact value can shift slightly with cleanup/merge at higher k).
      for (const gray of grayEntries) expect(gray.rgb[0]).toBeGreaterThan(150);
    }
  });
});

describe("KNOWN GAP (G-024's own motivating problem): a genuine gray region and a boundary-manufactured gray are indistinguishable today", () => {
  it("today's pipeline produces two different, unrelated grays with no way to tell which is real content and which is an averaging artifact", () => {
    // Same hard split, PLUS a genuine, unambiguous gray region elsewhere
    // in the image, well away from the boundary.
    const buffer = makeHardSplitWithGenuineGrayBuffer(64, 64, 30);
    const pattern = buildPattern(buffer, { longerSideStitches: 16, colorCount: 4 });

    expect(pattern.palette).toHaveLength(4);
    const byRgb = new Map(pattern.palette.map((p) => [p.rgb.join(","), p.count]));

    // The genuine gray region survives as its own, exact-colored entry.
    expect(byRgb.get("128,128,128")).toBeGreaterThan(0);

    // A SEPARATE, manufactured "transition" gray also exists, at a
    // meaningfully different value from the genuine one -- purely an
    // artifact of averaging the hard black/white boundary, not real
    // content. This is exactly the conflation G-024 exists to fix: today,
    // both are just "some gray cluster" the quantizer found, with no
    // semantic distinction between "real region" and "averaging
    // artifact." A future Crisp-mode fixture should assert the OPPOSITE:
    // the genuine gray survives, but no unsupported transition-gray
    // entry forms at the black/white boundary.
    const manufacturedGray = pattern.palette.find((p) => p.rgb[0] > 150 && p.rgb[0] < 255 && p.rgb.join(",") !== "128,128,128");
    expect(manufacturedGray).toBeDefined();
    expect(Math.abs(manufacturedGray!.rgb[0] - 128)).toBeGreaterThan(30); // genuinely a different gray, not noise around the same one
  });
});
