import { describe, expect, it } from "vitest";
import { rgbToOklab } from "@/lib/color/color";
import { analyzeEnhancement, applyEnhancement, ENHANCEMENT_PRESETS } from "@/lib/pipeline/enhance";
import { buildEnhancedPreview, downscaleForPreview } from "@/lib/pipeline/enhance-preview";
import type { PixelBuffer } from "@/lib/types";
import { makePhotoLikeBuffer } from "./helpers/fixtures";

/** G-032 M3: the photo preview's pure half and its worker client. */

function meanDeltaE(a: PixelBuffer, b: PixelBuffer): number {
  let sum = 0;
  const n = a.width * a.height;
  for (let i = 0; i < n; i++) {
    const p = rgbToOklab([a.data[i * 4], a.data[i * 4 + 1], a.data[i * 4 + 2]]);
    const q = rgbToOklab([b.data[i * 4], b.data[i * 4 + 1], b.data[i * 4 + 2]]);
    sum += Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  }
  return sum / n;
}

describe("downscaleForPreview", () => {
  it("returns a source already within the limit unchanged", () => {
    const small = makePhotoLikeBuffer(300, 200);
    expect(downscaleForPreview(small, 1200)).toBe(small);
  });

  it("fits the longer side to the limit and keeps the aspect ratio", () => {
    const large = makePhotoLikeBuffer(2400, 1600);
    const preview = downscaleForPreview(large, 1200);
    expect(preview.width).toBe(1200);
    expect(preview.height).toBe(800);
    expect(preview.data.length).toBe(1200 * 800 * 4);
  });
});

describe("buildEnhancedPreview", () => {
  it.each(["auto", "vivid", "portrait"] as const)("stays close to downscaling the full-resolution enhanced photo (%s)", (mode) => {
    const source = makePhotoLikeBuffer(1800, 1200, 30);
    const params = analyzeEnhancement(source, ENHANCEMENT_PRESETS[mode]);
    const preview = buildEnhancedPreview(source, params, 600);
    const reference = downscaleForPreview(applyEnhancement(source, params), 600);
    expect(preview.width).toBe(reference.width);
    // Enhancement doesn't commute with downscaling; the bound makes the approximation explicit (D116).
    expect(meanDeltaE(preview, reference)).toBeLessThan(0.02);
  });
});
