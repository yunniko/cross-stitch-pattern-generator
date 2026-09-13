import { describe, expect, it } from "vitest";
import { linearToSrgb, oklabToLinearRgb, oklabToRgb, oklabToRgbGamutMapped, rgbToOklab, type Oklab } from "@/lib/color/color";
import type { RGB } from "@/lib/types";

function chroma([, a, b]: Oklab): number {
  return Math.hypot(a, b);
}

function hue([, a, b]: Oklab): number {
  return Math.atan2(b, a);
}

function angleDifference(x: number, y: number): number {
  const d = Math.abs(x - y) % (2 * Math.PI);
  return d > Math.PI ? 2 * Math.PI - d : d;
}

describe("oklabToLinearRgb", () => {
  it("matches oklabToRgb for an in-gamut color once encoded", () => {
    const lab = rgbToOklab([120, 80, 200]);
    const encoded = oklabToLinearRgb(lab).map(linearToSrgb);
    expect(encoded).toEqual(oklabToRgb(lab));
  });

  it("is unclamped, so an out-of-gamut color has a component outside [0, 1]", () => {
    const [r, g, b] = oklabToLinearRgb([0.6, 0.3, 0.1]);
    expect(Math.min(r, g, b) < 0 || Math.max(r, g, b) > 1).toBe(true);
  });
});

describe("oklabToRgbGamutMapped", () => {
  it("passes an in-gamut color through unchanged", () => {
    const rgb: RGB = [120, 80, 200];
    expect(oklabToRgbGamutMapped(rgbToOklab(rgb))).toEqual(rgb);
  });

  it("maps an out-of-gamut color by reducing chroma at constant lightness and hue, unlike channel clipping", () => {
    const source: Oklab = [0.6, 0.3, 0.1];
    const mapped = oklabToRgbGamutMapped(source);
    for (const channel of mapped) {
      expect(Number.isInteger(channel)).toBe(true);
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(255);
    }
    const result = rgbToOklab(mapped);
    // The CSS hybrid may accept a clip within JND 0.02 of the chroma-reduced candidate, plus 8-bit rounding.
    expect(Math.abs(result[0] - source[0])).toBeLessThan(0.025);
    expect(angleDifference(hue(result), hue(source))).toBeLessThan(0.06);
    expect(chroma(result)).toBeLessThan(chroma(source));

    // Naive per-channel clipping shifts lightness or hue measurably more.
    const clipped = rgbToOklab(oklabToRgb(source));
    const clipError = Math.abs(clipped[0] - source[0]) + angleDifference(hue(clipped), hue(source));
    const mappedError = Math.abs(result[0] - source[0]) + angleDifference(hue(result), hue(source));
    expect(mappedError).toBeLessThan(clipError);
  });

  it("returns black and white for lightness at or beyond the ends", () => {
    expect(oklabToRgbGamutMapped([0, 0.1, 0.1])).toEqual([0, 0, 0]);
    expect(oklabToRgbGamutMapped([1.2, -0.1, 0.05])).toEqual([255, 255, 255]);
  });

  it("keeps a very dark saturated color finite and near its lightness", () => {
    const source: Oklab = [0.08, 0.2, -0.25];
    const result = rgbToOklab(oklabToRgbGamutMapped(source));
    expect(result.every(Number.isFinite)).toBe(true);
    expect(Math.abs(result[0] - source[0])).toBeLessThan(0.02);
  });
});
