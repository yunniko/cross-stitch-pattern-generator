import { describe, expect, it } from "vitest";
import { labDistanceSquared, labToRgb, luminance, rgbToLab } from "@/lib/color";
import type { RGB } from "@/lib/types";

describe("rgbToLab / labToRgb", () => {
  it("round-trips pure black and white exactly", () => {
    expect(labToRgb(rgbToLab([0, 0, 0]))).toEqual([0, 0, 0]);
    expect(labToRgb(rgbToLab([255, 255, 255]))).toEqual([255, 255, 255]);
  });

  it("round-trips arbitrary in-gamut colors within rounding error", () => {
    const colors: RGB[] = [
      [200, 50, 30],
      [10, 200, 120],
      [40, 60, 220],
      [128, 128, 128],
    ];
    for (const rgb of colors) {
      const [r, g, b] = labToRgb(rgbToLab(rgb));
      expect(Math.abs(r - rgb[0])).toBeLessThanOrEqual(1);
      expect(Math.abs(g - rgb[1])).toBeLessThanOrEqual(1);
      expect(Math.abs(b - rgb[2])).toBeLessThanOrEqual(1);
    }
  });

  it("places perceptually similar colors closer than very different ones", () => {
    const red = rgbToLab([220, 20, 20]);
    const nearRed = rgbToLab([200, 30, 25]);
    const blue = rgbToLab([20, 20, 220]);
    expect(labDistanceSquared(red, nearRed)).toBeLessThan(labDistanceSquared(red, blue));
  });
});

describe("luminance", () => {
  it("rates white as brighter than black", () => {
    expect(luminance([255, 255, 255])).toBe(255);
    expect(luminance([0, 0, 0])).toBe(0);
  });

  it("weights green highest, matching human perception", () => {
    expect(luminance([255, 0, 0])).toBeLessThan(luminance([0, 255, 0]));
    expect(luminance([0, 0, 255])).toBeLessThan(luminance([255, 0, 0]));
  });
});
