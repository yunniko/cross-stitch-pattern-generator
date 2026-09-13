import { describe, expect, it } from "vitest";
import { rgbToOkhsl } from "@/lib/color/okhsl";
import type { RGB } from "@/lib/types";

/**
 * G-033: the Okhsl port against Björn Ottosson's reference. These values were printed by `srgb_to_okhsl` from
 * ok_color.h (https://bottosson.github.io/misc/ok_color.h, MIT, retrieved 2026-09-13), compiled with MSYS2 g++ -std=c++17.
 * The reference returns NaN saturation for black and white and an arbitrary hue with ~1e-7 saturation for greys; the port
 * defines neutral colours as hue 0 and saturation 0, and clamps saturation to 1 (magenta's reference value is 1.000039).
 */
const REFERENCE: Array<{ rgb: RGB; h: number; s: number; l: number }> = [
  { rgb: [0, 0, 0], h: 0, s: NaN, l: 0 },
  { rgb: [255, 255, 255], h: 0.25, s: NaN, l: 1 },
  { rgb: [128, 128, 128], h: 0.125, s: 2.19519578e-7, l: 0.53570646 },
  { rgb: [64, 64, 64], h: 0.375, s: 2.95757303e-7, l: 0.276216418 },
  { rgb: [200, 200, 200], h: 0.823791742, s: 5.36852781e-7, l: 0.805416703 },
  { rgb: [255, 0, 0], h: 0.0812052786, s: 1.00000024, l: 0.568084657 },
  { rgb: [0, 255, 0], h: 0.395820409, s: 0.999999762, l: 0.844528913 },
  { rgb: [0, 0, 255], h: 0.733477831, s: 0.999999881, l: 0.366565347 },
  { rgb: [255, 255, 0], h: 0.304914534, s: 0.999999881, l: 0.96270436 },
  { rgb: [0, 255, 255], h: 0.541024864, s: 0.99999994, l: 0.889848292 },
  { rgb: [255, 0, 255], h: 0.912120581, s: 1.00003898, l: 0.653298736 },
  { rgb: [199, 43, 59], h: 0.0594578087, s: 0.893590391, l: 0.472745359 },
  { rgb: [19, 71, 125], h: 0.702871323, s: 0.805197239, l: 0.302393496 },
  { rgb: [24, 144, 101], h: 0.451620936, s: 0.950716794, l: 0.513483465 },
  { rgb: [240, 234, 218], h: 0.249432594, s: 0.367670983, l: 0.927118719 },
  { rgb: [171, 2, 73], h: 0.0205812454, s: 0.989340782, l: 0.393664718 },
  { rgb: [97, 58, 44], h: 0.112383217, s: 0.437587023, l: 0.298830509 },
  { rgb: [210, 16, 53], h: 0.0584781468, s: 0.978761256, l: 0.478600681 },
];

const TOLERANCE = 1e-4;

describe("rgbToOkhsl", () => {
  it.each(REFERENCE)("matches ok_color.h for rgb $rgb", ({ rgb, h, s, l }) => {
    const result = rgbToOkhsl(rgb);
    expect(Math.abs(result.l - l)).toBeLessThan(TOLERANCE);
    const neutral = !Number.isFinite(s) || s < 1e-3;
    if (neutral) {
      expect(result.s).toBeLessThan(TOLERANCE);
    } else {
      expect(Math.abs(result.s - Math.min(1, s))).toBeLessThan(TOLERANCE);
      const hueGap = Math.abs(result.h - h);
      expect(Math.min(hueGap, 1 - hueGap)).toBeLessThan(TOLERANCE);
    }
  });

  it("keeps every component within 0–1", () => {
    for (const { rgb } of REFERENCE) {
      const { h, s, l } = rgbToOkhsl(rgb);
      for (const value of [h, s, l]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });
});
