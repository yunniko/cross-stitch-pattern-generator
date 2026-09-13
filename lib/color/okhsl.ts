// sRGB to Okhsl, ported to TypeScript from Björn Ottosson's reference implementation ok_color.h
// (https://bottosson.github.io/misc/ok_color.h, retrieved 2026-09-13; described at
// https://bottosson.github.io/posts/colorpicker/). Only the sRGB -> Okhsl direction is ported.
//
// Copyright (c) 2021 Björn Ottosson
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
// documentation files (the "Software"), to deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
// Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
// WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
// COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import type { RGB } from "../types";

export interface Okhsl {
  /** Hue, 0–1. */
  h: number;
  /** Saturation, 0–1. */
  s: number;
  /** Lightness, 0–1. */
  l: number;
}

/** Below this OKLab chroma a colour counts as neutral; the reference divides by chroma and returns NaN for greys. */
const NEUTRAL_CHROMA = 1e-7;

function srgbTransferInverse(a: number): number {
  return a > 0.04045 ? Math.pow((a + 0.055) / 1.055, 2.4) : a / 12.92;
}

function linearSrgbToOklab(r: number, g: number, b: number): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabToLinearSrgb(L: number, a: number, b: number): [number, number, number] {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** Maximum saturation (C/L) that fits sRGB for a normalized hue direction (a² + b² = 1). */
function computeMaxSaturation(a: number, b: number): number {
  let k0: number, k1: number, k2: number, k3: number, k4: number, wl: number, wm: number, ws: number;
  if (-1.88170328 * a - 0.80936493 * b > 1) {
    k0 = 1.19086277; k1 = 1.76576728; k2 = 0.59662641; k3 = 0.75515197; k4 = 0.56771245;
    wl = 4.0767416621; wm = -3.3077115913; ws = 0.2309699292;
  } else if (1.81444104 * a - 1.19445276 * b > 1) {
    k0 = 0.73956515; k1 = -0.45954404; k2 = 0.08285427; k3 = 0.1254107; k4 = 0.14503204;
    wl = -1.2684380046; wm = 2.6097574011; ws = -0.3413193965;
  } else {
    k0 = 1.35733652; k1 = -0.00915799; k2 = -1.1513021; k3 = -0.50559606; k4 = 0.00692167;
    wl = -0.0041960863; wm = -0.7034186147; ws = 1.707614701;
  }

  let S = k0 + k1 * a + k2 * b + k3 * a * a + k4 * a * b;

  const kL = 0.3963377774 * a + 0.2158037573 * b;
  const kM = -0.1055613458 * a - 0.0638541728 * b;
  const kS = -0.0894841775 * a - 1.291485548 * b;

  const l_ = 1 + S * kL;
  const m_ = 1 + S * kM;
  const s_ = 1 + S * kS;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  const lDS = 3 * kL * l_ * l_;
  const mDS = 3 * kM * m_ * m_;
  const sDS = 3 * kS * s_ * s_;
  const lDS2 = 6 * kL * kL * l_;
  const mDS2 = 6 * kM * kM * m_;
  const sDS2 = 6 * kS * kS * s_;
  const f = wl * l + wm * m + ws * s;
  const f1 = wl * lDS + wm * mDS + ws * sDS;
  const f2 = wl * lDS2 + wm * mDS2 + ws * sDS2;
  S = S - (f * f1) / (f1 * f1 - 0.5 * f * f2);
  return S;
}

function findCusp(a: number, b: number): { L: number; C: number } {
  const sCusp = computeMaxSaturation(a, b);
  const [r, g, bl] = oklabToLinearSrgb(1, sCusp * a, sCusp * b);
  const L = Math.cbrt(1 / Math.max(r, g, bl));
  return { L, C: L * sCusp };
}

/** Intersection with the sRGB gamut of the line L = L0·(1 − t) + t·L1, C = t·C1. */
function findGamutIntersection(a: number, b: number, L1: number, C1: number, L0: number, cusp: { L: number; C: number }): number {
  let t: number;
  if ((L1 - L0) * cusp.C - (cusp.L - L0) * C1 <= 0) {
    t = (cusp.C * L0) / (C1 * cusp.L + cusp.C * (L0 - L1));
  } else {
    t = (cusp.C * (L0 - 1)) / (C1 * (cusp.L - 1) + cusp.C * (L0 - L1));

    const dL = L1 - L0;
    const dC = C1;
    const kL = 0.3963377774 * a + 0.2158037573 * b;
    const kM = -0.1055613458 * a - 0.0638541728 * b;
    const kS = -0.0894841775 * a - 1.291485548 * b;
    const lDt = dL + dC * kL;
    const mDt = dL + dC * kM;
    const sDt = dL + dC * kS;

    const L = L0 * (1 - t) + t * L1;
    const C = t * C1;
    const l_ = L + C * kL;
    const m_ = L + C * kM;
    const s_ = L + C * kS;
    const l = l_ * l_ * l_;
    const m = m_ * m_ * m_;
    const s = s_ * s_ * s_;
    const ldt = 3 * lDt * l_ * l_;
    const mdt = 3 * mDt * m_ * m_;
    const sdt = 3 * sDt * s_ * s_;
    const ldt2 = 6 * lDt * lDt * l_;
    const mdt2 = 6 * mDt * mDt * m_;
    const sdt2 = 6 * sDt * sDt * s_;

    const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s - 1;
    const r1 = 4.0767416621 * ldt - 3.3077115913 * mdt + 0.2309699292 * sdt;
    const r2 = 4.0767416621 * ldt2 - 3.3077115913 * mdt2 + 0.2309699292 * sdt2;
    const uR = r1 / (r1 * r1 - 0.5 * r * r2);
    let tR = -r * uR;

    const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s - 1;
    const g1 = -1.2684380046 * ldt + 2.6097574011 * mdt - 0.3413193965 * sdt;
    const g2 = -1.2684380046 * ldt2 + 2.6097574011 * mdt2 - 0.3413193965 * sdt2;
    const uG = g1 / (g1 * g1 - 0.5 * g * g2);
    let tG = -g * uG;

    const bb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s - 1;
    const b1 = -0.0041960863 * ldt - 0.7034186147 * mdt + 1.707614701 * sdt;
    const b2 = -0.0041960863 * ldt2 - 0.7034186147 * mdt2 + 1.707614701 * sdt2;
    const uB = b1 / (b1 * b1 - 0.5 * bb * b2);
    let tB = -bb * uB;

    tR = uR >= 0 ? tR : Number.MAX_VALUE;
    tG = uG >= 0 ? tG : Number.MAX_VALUE;
    tB = uB >= 0 ? tB : Number.MAX_VALUE;
    t += Math.min(tR, tG, tB);
  }
  return t;
}

function toe(x: number): number {
  const k1 = 0.206;
  const k2 = 0.03;
  const k3 = (1 + k1) / (1 + k2);
  return 0.5 * (k3 * x - k1 + Math.sqrt((k3 * x - k1) * (k3 * x - k1) + 4 * k2 * k3 * x));
}

function stMid(a: number, b: number): { S: number; T: number } {
  const S =
    0.11516993 +
    1 / (7.4477897 + 4.1590124 * b + a * (-2.19557347 + 1.75198401 * b + a * (-2.13704948 - 10.02301043 * b + a * (-4.24894561 + 5.38770819 * b + 4.69891013 * a))));
  const T =
    0.11239642 +
    1 / (1.6132032 - 0.68124379 * b + a * (0.40370612 + 0.90148123 * b + a * (-0.27087943 + 0.6122399 * b + a * (0.00299215 - 0.45399568 * b - 0.14661872 * a))));
  return { S, T };
}

function chromaLimits(L: number, a: number, b: number): { C0: number; Cmid: number; Cmax: number } {
  const cusp = findCusp(a, b);
  const Cmax = findGamutIntersection(a, b, L, 1, L, cusp);
  const stMaxS = cusp.C / cusp.L;
  const stMaxT = cusp.C / (1 - cusp.L);
  const k = Cmax / Math.min(L * stMaxS, (1 - L) * stMaxT);

  const mid = stMid(a, b);
  const midA = L * mid.S;
  const midB = (1 - L) * mid.T;
  const Cmid = 0.9 * k * Math.sqrt(Math.sqrt(1 / (1 / (midA * midA * midA * midA) + 1 / (midB * midB * midB * midB))));

  const zeroA = L * 0.4;
  const zeroB = (1 - L) * 0.8;
  const C0 = Math.sqrt(1 / (1 / (zeroA * zeroA) + 1 / (zeroB * zeroB)));
  return { C0, Cmid, Cmax };
}

/**
 * 8-bit sRGB to Okhsl. Matches ok_color.h's srgb_to_okhsl, except that a neutral colour (including black and white),
 * for which the reference divides by zero, gets hue 0 and saturation 0, and saturation is clamped to 0–1.
 */
export function rgbToOkhsl(rgb: RGB): Okhsl {
  const [L, a, b] = linearSrgbToOklab(srgbTransferInverse(rgb[0] / 255), srgbTransferInverse(rgb[1] / 255), srgbTransferInverse(rgb[2] / 255));
  const l = Math.min(1, Math.max(0, toe(L)));
  const C = Math.sqrt(a * a + b * b);
  if (C < NEUTRAL_CHROMA || L <= 0 || L >= 1) return { h: 0, s: 0, l };

  const aN = a / C;
  const bN = b / C;
  const h = 0.5 + (0.5 * Math.atan2(-b, -a)) / Math.PI;
  const { C0, Cmid, Cmax } = chromaLimits(L, aN, bN);

  const midS = 0.8;
  const midInv = 1.25;
  let s: number;
  if (C < Cmid) {
    const k1 = midS * C0;
    const k2 = 1 - k1 / Cmid;
    s = (C / (k1 + k2 * C)) * midS;
  } else {
    const k0 = Cmid;
    const k1 = ((1 - midS) * Cmid * Cmid * midInv * midInv) / C0;
    const k2 = 1 - k1 / (Cmax - Cmid);
    const t = (C - k0) / (k1 + k2 * (C - k0));
    s = midS + (1 - midS) * t;
  }
  return { h, s: Math.min(1, Math.max(0, s)), l };
}
