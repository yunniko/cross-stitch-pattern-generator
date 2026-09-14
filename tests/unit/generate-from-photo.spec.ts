import { describe, expect, it } from "vitest";
import { analyzeEnhancement, ENHANCEMENT_PRESETS } from "@/lib/pipeline/enhance";
import { generateFromPhoto } from "@/lib/pipeline/generate-from-photo";
import { buildPattern } from "@/lib/pipeline/pattern";
import { capSourceForGrid } from "@/lib/pipeline/source-cap";
import type { StitchPattern } from "@/lib/types";
import { makePhotoLikeBuffer } from "./helpers/fixtures";

function expectSamePattern(actual: StitchPattern, expected: StitchPattern) {
  expect([actual.width, actual.height, actual.isLandscape]).toEqual([expected.width, expected.height, expected.isLandscape]);
  expect(Array.from(actual.cellPalette)).toEqual(Array.from(expected.cellPalette));
  expect(actual.palette.map((c) => [c.rgb, c.symbol, c.name, c.count])).toEqual(expected.palette.map((c) => [c.rgb, c.symbol, c.name, c.count]));
}

describe("generateFromPhoto (G-035 M3, D127)", () => {
  it("without a cap is exactly buildPattern on the full photo", () => {
    const photo = makePhotoLikeBuffer(600, 450);
    const options = { longerSideStitches: 50, colorCount: 12 };
    const result = generateFromPhoto(photo, options);
    expectSamePattern(result.pattern, buildPattern(photo, options));
    expect(result.source).toEqual({ width: 600, height: 450, requestedPixelsPerStitch: null, capped: false, reason: undefined });
  });

  it("passing buildPattern the enhancement parameters of the same photo changes nothing", () => {
    const photo = makePhotoLikeBuffer(600, 450);
    const options = { longerSideStitches: 50, colorCount: 12, enhancementMode: "auto" as const };
    const withParameters = buildPattern(photo, { ...options, enhancementParameters: analyzeEnhancement(photo, ENHANCEMENT_PRESETS.auto) });
    expectSamePattern(withParameters, buildPattern(photo, options));
  });

  it("reads an exact multiple of the grid and applies enhancement analysed on the full photo", () => {
    const photo = makePhotoLikeBuffer(600, 450);
    const options = { longerSideStitches: 50, colorCount: 12, enhancementMode: "auto" as const };
    const result = generateFromPhoto(photo, { ...options, pixelsPerStitch: 2 });
    expect(result.source).toEqual({ width: 100, height: 76, requestedPixelsPerStitch: 2, capped: true });

    const cap = capSourceForGrid(photo, 50, 2);
    const expected = buildPattern(cap.buffer, {
      ...options,
      enhancementParameters: analyzeEnhancement(photo, ENHANCEMENT_PRESETS.auto),
      sourceDimensions: { width: 600, height: 450 },
    });
    expectSamePattern(result.pattern, expected);
  });

  it("keeps the original photo's orientation when the capped copy is square", () => {
    const photo = makePhotoLikeBuffer(1001, 1000);
    const cap = capSourceForGrid(photo, 100, 2);
    expect([cap.buffer.width, cap.buffer.height]).toEqual([200, 200]);
    expect(buildPattern(cap.buffer, { longerSideStitches: 100, colorCount: 8 }).isLandscape).toBe(false);

    const result = generateFromPhoto(photo, { longerSideStitches: 100, colorCount: 8, pixelsPerStitch: 2 });
    expect(result.pattern.isLandscape).toBe(true);
  });

  it("generates a transparent photo at full resolution and says why it wasn't capped", () => {
    const photo = makePhotoLikeBuffer(300, 200);
    photo.data[3] = 0;
    const options = { longerSideStitches: 50, colorCount: 8 };
    const result = generateFromPhoto(photo, { ...options, pixelsPerStitch: 2 });
    expect(result.source).toEqual({ width: 300, height: 200, requestedPixelsPerStitch: 2, capped: false, reason: "transparent" });
    expectSamePattern(result.pattern, buildPattern(photo, options));
  });
});
