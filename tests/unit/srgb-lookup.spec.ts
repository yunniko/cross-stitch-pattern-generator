import { describe, expect, it } from "vitest";
import { oklabFromBytes, rgbToOklab, srgbToLinear, SRGB_TO_LINEAR, writeOklab } from "@/lib/color/color";

// Verbatim copies of the pre-G-035 implementations: the lookup table and the allocation-free helpers must return the
// identical doubles, bit for bit, or the golden hashes would move (D107).
function referenceSrgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function referenceRgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const rl = referenceSrgbToLinear(r);
  const gl = referenceSrgbToLinear(g);
  const bl = referenceSrgbToLinear(b);
  const l = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl;
  const m = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl;
  const s = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl;
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  return [
    0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
  ];
}

function expectSameBits(actual: readonly number[] | Float64Array, expected: readonly number[], context: string) {
  for (let i = 0; i < expected.length; i++) {
    if (!Object.is(actual[i], expected[i])) throw new Error(`${context}: component ${i} is ${actual[i]}, expected ${expected[i]}`);
  }
}

describe("sRGB lookup table (G-035 M1)", () => {
  it("holds the formula's exact double for every 8-bit value", () => {
    expect(SRGB_TO_LINEAR).toHaveLength(256);
    for (let c = 0; c < 256; c++) expect(Object.is(SRGB_TO_LINEAR[c], referenceSrgbToLinear(c))).toBe(true);
  });

  it("srgbToLinear matches the formula for integers, zeros, fractions and out-of-range input", () => {
    const inputs = [...Array.from({ length: 256 }, (_, c) => c), -0, 0.5, 1.5, 128.25, 254.999, -3, 255.5, 300, NaN];
    for (const c of inputs) expect(Object.is(srgbToLinear(c), referenceSrgbToLinear(c))).toBe(true);
  });

  it("writeOklab, oklabFromBytes and rgbToOklab match the pre-table conversion bit for bit", () => {
    const out = new Float64Array(6);
    const check = (r: number, g: number, b: number) => {
      const expected = referenceRgbToOklab(r, g, b);
      const context = `rgb(${r}, ${g}, ${b})`;
      expectSameBits(oklabFromBytes(r, g, b), expected, context);
      expectSameBits(rgbToOklab([r, g, b]), expected, context);
      writeOklab(r, g, b, out, 3);
      expectSameBits(out.subarray(3), expected, context);
    };
    for (let c = 0; c < 256; c++) {
      check(c, c, c);
      check(c, 0, 0);
      check(0, c, 0);
      check(0, 0, c);
    }
    let seed = 0x9e3779b9;
    const next = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed >>> 24;
    };
    for (let i = 0; i < 20_000; i++) check(next(), next(), next());
    check(12.5, 200.75, 0.25); // non-integer channels take the formula path
  });

  it("writeOklab leaves slots outside its offset untouched", () => {
    const out = new Float64Array([7, 7, 7, 7, 7, 7]);
    writeOklab(10, 20, 30, out, 3);
    expect(Array.from(out.subarray(0, 3))).toEqual([7, 7, 7]);
  });
});
