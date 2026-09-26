import { describe, expect, it } from "vitest";
import { oklabFromBytes } from "@/lib/color/color";
import {
  adjustOklab,
  adjustPixelBuffer,
  clampAdjust,
  isNeutralAdjust,
  MID_L,
  NEUTRAL_ADJUST,
  readAdjust,
  type PhotoAdjust,
} from "@/lib/pipeline/photo-adjust";
import type { PixelBuffer } from "@/lib/types";

/** G-074 M1: what the four sliders do, and what they must never do. */

const only = (slider: keyof PhotoAdjust, value: number): PhotoAdjust => ({ ...NEUTRAL_ADJUST, [slider]: value });

function lightnessOf(grey: number, adjust: PhotoAdjust): number {
  const [L, a, b] = oklabFromBytes(grey, grey, grey);
  const out = new Float64Array(3);
  adjustOklab(L, a, b, adjust, out);
  return out[0];
}

function photo(pixels: Array<[number, number, number, number]>): PixelBuffer {
  const data = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach((p, i) => data.set(p, i * 4));
  return { data, width: pixels.length, height: 1 };
}

describe("brightness", () => {
  it("lifts every grey while white stays white", () => {
    expect(lightnessOf(128, only("brightness", 100))).toBeGreaterThan(lightnessOf(128, NEUTRAL_ADJUST));
    expect(lightnessOf(255, only("brightness", 100))).toBeCloseTo(1, 6);
  });

  it("compresses the highlights instead of burning them out", () => {
    // The curve pulls towards white rather than adding a constant, and this is the difference between the two:
    // adding would push both of these past 1 and the clamp would fuse them into one flat white.
    const lifted = [250, 255].map((g) => lightnessOf(g, only("brightness", 100)));
    expect(lifted[0]).toBeLessThan(lifted[1]);
    expect(lifted[0]).toBeLessThan(1);
  });

  it("keeps the shadows apart when it darkens them", () => {
    const dropped = [8, 24].map((g) => lightnessOf(g, only("brightness", -100)));
    expect(dropped[0]).toBeLessThan(dropped[1]);
    expect(dropped[0]).toBeGreaterThan(0);
    expect(lightnessOf(0, only("brightness", -100))).toBeCloseTo(0, 6);
    expect(lightnessOf(128, only("brightness", -100))).toBeLessThan(lightnessOf(128, NEUTRAL_ADJUST));
  });

  it("is monotonic: more of the slider is never less light", () => {
    const steps = [-100, -50, 0, 50, 100].map((v) => lightnessOf(96, only("brightness", v)));
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
  });
});

describe("contrast", () => {
  it("turns about mid grey, which stays where it is", () => {
    // The pivot is the L of sRGB 128, so a photo does not drift lighter or darker as contrast moves.
    for (const value of [-100, -40, 40, 100]) {
      expect(lightnessOf(128, only("contrast", value))).toBeCloseTo(MID_L, 2);
    }
  });

  it("pushes the ends apart, and flattens them together the other way", () => {
    const dark = 64;
    const light = 192;
    const spread = (v: number) => lightnessOf(light, only("contrast", v)) - lightnessOf(dark, only("contrast", v));
    expect(spread(80)).toBeGreaterThan(spread(0));
    expect(spread(-80)).toBeLessThan(spread(0));
  });
});

describe("saturation", () => {
  it("scales colour without touching lightness", () => {
    const [L, a, b] = oklabFromBytes(200, 60, 40);
    const out = new Float64Array(3);
    adjustOklab(L, a, b, only("saturation", 50), out);
    expect(out[0]).toBeCloseTo(L, 12);
    expect(out[1]).toBeCloseTo(a * 1.5, 12);
    expect(out[2]).toBeCloseTo(b * 1.5, 12);
  });

  it("takes all the colour out at its low end, leaving a grey of the same lightness", () => {
    const [L, a, b] = oklabFromBytes(200, 60, 40);
    const out = new Float64Array(3);
    adjustOklab(L, a, b, only("saturation", -100), out);
    expect(out[1]).toBeCloseTo(0, 12);
    expect(out[2]).toBeCloseTo(0, 12);
    expect(out[0]).toBeCloseTo(L, 12);
  });
});

describe("warm and cool", () => {
  it("moves a neutral grey towards amber one way and blue the other", () => {
    const [L, a, b] = oklabFromBytes(128, 128, 128);
    const warm = new Float64Array(3);
    const cool = new Float64Array(3);
    adjustOklab(L, a, b, only("temperature", 100), warm);
    adjustOklab(L, a, b, only("temperature", -100), cool);
    // OKLab's b is blue to yellow: warmer is more yellow, cooler is less.
    expect(warm[2]).toBeGreaterThan(b);
    expect(cool[2]).toBeLessThan(b);
    expect(warm[0]).toBeCloseTo(L, 12);
  });
});

describe("neutral", () => {
  it("hands back the very buffer it was given, not a copy of it", () => {
    // Byte-identity is the criterion, and identity of the object is the only way to be sure of it.
    const source = photo([
      [10, 20, 30, 255],
      [200, 180, 160, 128],
    ]);
    expect(adjustPixelBuffer(source, NEUTRAL_ADJUST)).toBe(source);
    expect(isNeutralAdjust(NEUTRAL_ADJUST)).toBe(true);
  });

  it("leaves alpha alone even when it changes every colour", () => {
    // Transparency is absence (D196): an adjustment changes colour, never what is or is not there.
    const source = photo([
      [10, 20, 30, 0],
      [200, 180, 160, 77],
    ]);
    const out = adjustPixelBuffer(source, { brightness: 50, contrast: 50, saturation: 50, temperature: 50 });
    expect(out.data[3]).toBe(0);
    expect(out.data[7]).toBe(77);
    expect(out).not.toBe(source);
  });
});

describe("reading the sliders back", () => {
  it("keeps a bad saved value from reaching a photo", () => {
    expect(clampAdjust("60")).toBe(0);
    expect(clampAdjust(NaN)).toBe(0);
    expect(clampAdjust(9999)).toBe(100);
    expect(clampAdjust(-9999)).toBe(-100);
    expect(clampAdjust(12.6)).toBe(13);
  });

  it("is neutral wherever the data does not say otherwise", () => {
    expect(readAdjust(undefined)).toEqual(NEUTRAL_ADJUST);
    expect(readAdjust({ brightness: 20 })).toEqual({ ...NEUTRAL_ADJUST, brightness: 20 });
  });
});
