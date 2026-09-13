import { describe, expect, it } from "vitest";
import { rgbToOklab } from "@/lib/color/color";
import {
  analyzeEnhancement,
  applyEnhancement,
  enhancePixelBuffer,
  ENHANCEMENT_PRESETS,
  planGamma,
  planLevels,
  skinWeight,
  type EnhancementPreset,
} from "@/lib/pipeline/enhance";
import type { PixelBuffer, RGB } from "@/lib/types";
import { makeBuffer, pseudoNoise } from "./helpers/fixtures";

/** G-032 M1: the pure enhancement core on synthetic images (criteria 3a–3d and 5). */

const MODES = ["auto", "vivid", "portrait"] as const;

function enhancePixelBufferWith(source: PixelBuffer, preset: EnhancementPreset): PixelBuffer {
  return applyEnhancement(source, analyzeEnhancement(source, preset));
}

function pixel(buffer: PixelBuffer, i: number): RGB {
  return [buffer.data[i * 4], buffer.data[i * 4 + 1], buffer.data[i * 4 + 2]];
}

function meanDeltaE(a: PixelBuffer, b: PixelBuffer): number {
  let sum = 0;
  const n = a.width * a.height;
  for (let i = 0; i < n; i++) {
    const p = rgbToOklab(pixel(a, i));
    const q = rgbToOklab(pixel(b, i));
    sum += Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
  }
  return sum / n;
}

function medianL(buffer: PixelBuffer): number {
  const values: number[] = [];
  for (let i = 0; i < buffer.width * buffer.height; i++) values.push(rgbToOklab(pixel(buffer, i))[0]);
  values.sort((x, y) => x - y);
  return values[Math.floor(values.length / 2)];
}

function meanChroma(buffer: PixelBuffer, predicate: (x: number, y: number) => boolean = () => true): number {
  let sum = 0;
  let n = 0;
  for (let y = 0; y < buffer.height; y++) {
    for (let x = 0; x < buffer.width; x++) {
      if (!predicate(x, y)) continue;
      const [, a, b] = rgbToOklab(pixel(buffer, y * buffer.width + x));
      sum += Math.hypot(a, b);
      n++;
    }
  }
  return sum / n;
}

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (v: number) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
};

/** A well-exposed scene: a full-range neutral ramp on top, moderate colour patches below, mild noise. */
const wellExposed = makeBuffer(240, 160, (x, y) => {
  const noise = pseudoNoise(x, y, 6);
  if (y < 80) {
    const v = 12 + (x / 239) * 232 + noise;
    return [v, v, v];
  }
  const patches: RGB[] = [
    [170, 120, 90],
    [90, 140, 90],
    [80, 110, 170],
    [200, 190, 150],
  ];
  const base = patches[Math.min(3, Math.floor(x / 60))];
  return [base[0] + noise, base[1] + noise, base[2] + noise];
});

/** The same scene degraded in linear light: −1 EV, contrast reduced to 40% around mid-grey, warm cast. */
const degraded: PixelBuffer = (() => {
  const data = new Uint8ClampedArray(wellExposed.data.length);
  for (let o = 0; o < data.length; o += 4) {
    const cast = [1.1, 1, 0.85];
    for (let c = 0; c < 3; c++) {
      const linear = toLinear(wellExposed.data[o + c]) * 0.5;
      const contrasted = 0.09 + (linear - 0.09) * 0.4;
      data[o + c] = toSrgb(contrasted * cast[c]);
    }
    data[o + 3] = 255;
  }
  return { data, width: wellExposed.width, height: wellExposed.height };
})();

describe("enhancePixelBuffer", () => {
  it("returns the very same buffer for Off", () => {
    expect(enhancePixelBuffer(wellExposed, "off")).toBe(wellExposed);
  });

  it.each(MODES)("handles degenerate inputs without throwing (%s)", (mode) => {
    const cases: PixelBuffer[] = [
      makeBuffer(1, 1, () => [128, 64, 32]),
      makeBuffer(20, 20, () => [0, 0, 0]),
      makeBuffer(20, 20, () => [255, 255, 255]),
      makeBuffer(50, 40, () => [150, 120, 100]),
    ];
    for (const source of cases) {
      const result = enhancePixelBuffer(source, mode);
      expect(result.width).toBe(source.width);
      expect(result.data.length).toBe(source.data.length);
    }
    expect(Array.from(enhancePixelBuffer(cases[1], mode).data.slice(0, 3))).toEqual([0, 0, 0]);
    expect(Array.from(enhancePixelBuffer(cases[2], mode).data.slice(0, 3))).toEqual([255, 255, 255]);
    expect(meanDeltaE(enhancePixelBuffer(cases[3], mode), cases[3])).toBeLessThan(0.02);
  });

  it.each(MODES)("keeps a grayscale image grayscale (%s)", (mode) => {
    const gray = makeBuffer(120, 80, (x, y) => {
      const v = 30 + (x / 119) * 120 + pseudoNoise(x, y, 20);
      return [v, v, v];
    });
    const result = enhancePixelBuffer(gray, mode);
    for (let i = 0; i < gray.width * gray.height; i++) {
      const [r, g, b] = pixel(result, i);
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(1);
    }
  });

  it("copies alpha, keeps hidden RGB of transparent pixels, and ignores them in the statistics", () => {
    const make = (hidden: RGB) =>
      makeBuffer(80, 60, (x) => (x < 40 ? [60 + x, 50 + x, 40 + x] : hidden));
    const a = make([255, 0, 0]);
    const b = make([0, 0, 255]);
    for (const buffer of [a, b]) {
      for (let y = 0; y < 60; y++) for (let x = 40; x < 80; x++) buffer.data[(y * 80 + x) * 4 + 3] = 0;
      buffer.data[3] = 128; // one half-transparent opaque-area pixel
    }
    const paramsA = analyzeEnhancement(a, ENHANCEMENT_PRESETS.auto);
    const paramsB = analyzeEnhancement(b, ENHANCEMENT_PRESETS.auto);
    expect(paramsA.gains).toEqual(paramsB.gains);
    expect(Array.from(paramsA.toneLut)).toEqual(Array.from(paramsB.toneLut));

    const result = applyEnhancement(a, paramsA);
    for (let i = 0; i < 80 * 60; i++) expect(result.data[i * 4 + 3]).toBe(a.data[i * 4 + 3]);
    expect(Array.from(result.data.slice((79) * 4, 79 * 4 + 3))).toEqual([255, 0, 0]);
  });
});

describe("white balance", () => {
  it("moves a warm-cast scene's neutrals toward grey without exceeding the gain-ratio cap", () => {
    const castScene = makeBuffer(wellExposed.width, wellExposed.height, (x, y) => {
      const o = (y * wellExposed.width + x) * 4;
      const cast = [1.12, 1, 0.88];
      return [0, 1, 2].map((c) => toSrgb(toLinear(wellExposed.data[o + c]) * cast[c])) as unknown as RGB;
    });
    const params = analyzeEnhancement(castScene, ENHANCEMENT_PRESETS.auto);
    const ratio = Math.max(...params.gains) / Math.min(...params.gains);
    expect(ratio).toBeGreaterThan(1.01);
    expect(ratio).toBeLessThanOrEqual(ENHANCEMENT_PRESETS.auto.whiteBalance.maxGainRatio + 1e-9);
    const neutralRamp = (_x: number, y: number) => y < 80;
    expect(meanChroma(applyEnhancement(castScene, params), neutralRamp)).toBeLessThan(meanChroma(castScene, neutralRamp));
  });

  it("does not white-balance a single coloured surface, which a cast can't be told apart from", () => {
    const beigeWall = makeBuffer(100, 100, (x, y) => {
      const n = pseudoNoise(x, y, 6);
      return [150 + n, 120 + n, 100 + n];
    });
    expect(analyzeEnhancement(beigeWall, ENHANCEMENT_PRESETS.auto).gains).toEqual([1, 1, 1]);
  });

  it("leaves a neutral scene's gains at identity", () => {
    const params = analyzeEnhancement(wellExposed, ENHANCEMENT_PRESETS.auto);
    expect(params.gains).toEqual([1, 1, 1]);
  });
});

describe("tone", () => {
  it("planLevels leaves a full-range histogram alone and stretches a compressed one, within the cap", () => {
    const full = Float32Array.from({ length: 1001 }, (_, i) => i / 1000);
    expect(planLevels(full, ENHANCEMENT_PRESETS.auto.levels)).toBeNull();
    const compressed = Float32Array.from({ length: 1001 }, (_, i) => 0.4 + (i / 1000) * 0.3);
    const plan = planLevels(compressed, ENHANCEMENT_PRESETS.auto.levels)!;
    expect(plan).not.toBeNull();
    const [inLow, inHigh, outLow, outHigh] = plan;
    expect((outHigh - outLow) / (inHigh - inLow)).toBeLessThanOrEqual(ENHANCEMENT_PRESETS.auto.levels.maxStretch + 1e-9);
  });

  it("planGamma leaves a median inside the band alone and moves an outside one toward the nearest edge", () => {
    expect(planGamma(0.57, ENHANCEMENT_PRESETS.auto.midtone)).toBe(1);
    const lift = planGamma(0.35, ENHANCEMENT_PRESETS.auto.midtone);
    expect(lift).toBeLessThan(1);
    expect(0.35 ** lift).toBeLessThanOrEqual(0.5 + 1e-9);
    expect(planGamma(0.8, ENHANCEMENT_PRESETS.auto.midtone)).toBeGreaterThan(1);
  });

  it.each(MODES)("builds a monotonic tone curve and moves a dark, flat photo's median toward the band (%s)", (mode) => {
    const params = analyzeEnhancement(degraded, ENHANCEMENT_PRESETS[mode]);
    for (let i = 1; i < params.toneLut.length; i++) expect(params.toneLut[i]).toBeGreaterThanOrEqual(params.toneLut[i - 1]);
    const before = medianL(degraded);
    const after = medianL(applyEnhancement(degraded, params));
    expect(Math.abs(after - 0.57)).toBeLessThan(Math.abs(before - 0.57));
  });
});

describe("do no harm", () => {
  it.each(MODES)("changes a well-exposed, neutral-balanced photo only slightly (%s)", (mode) => {
    const change = meanDeltaE(enhancePixelBuffer(wellExposed, mode), wellExposed);
    expect(change).toBeLessThan(0.03);
  });

  // Capped steps (levels stretch, partial white balance) finish a large correction over several passes, so exact
  // idempotence isn't expected; repeated application must converge, each pass changing the image less (D114).
  it.each(MODES)("converges under repeated application (%s)", (mode) => {
    const once = enhancePixelBuffer(degraded, mode);
    const twice = enhancePixelBuffer(once, mode);
    const thrice = enhancePixelBuffer(twice, mode);
    const first = meanDeltaE(once, degraded);
    const second = meanDeltaE(twice, once);
    const third = meanDeltaE(thrice, twice);
    expect(second).toBeLessThan(first);
    expect(third).toBeLessThan(second);
  });

  it("keeps shadow and highlight tails graded instead of clipping them to pure black and white", () => {
    const params = analyzeEnhancement(degraded, ENHANCEMENT_PRESETS.auto);
    const at = (v: number) => params.toneLut[Math.round(v * (params.toneLut.length - 1))];
    expect(at(0)).toBe(0);
    expect(at(1)).toBeCloseTo(1, 5);
    expect(at(0.25)).toBeGreaterThan(0);
    expect(at(0.75)).toBeLessThan(1);
  });
});

describe("Codex round-2 fixes", () => {
  it("keeps a narrow high-key photo bright when the stretch is capped (no recentring to mid-grey)", () => {
    const highKey = Float32Array.from({ length: 1001 }, (_, i) => 0.9 + (i / 1000) * 0.03);
    const [inLow, inHigh, outLow, outHigh] = planLevels(highKey, ENHANCEMENT_PRESETS.auto.levels)!;
    expect((outLow + outHigh) / 2).toBeCloseTo((inLow + inHigh) / 2, 5);
    expect(outLow).toBeGreaterThan(0.8);
  });

  it("caps the composed tone curve's slope, so a very dark photo's shadow noise isn't amplified without bound", () => {
    const dark = makeBuffer(200, 150, (x, y) => {
      const v = 3 + (x / 199) * 40 + pseudoNoise(x, y, 4);
      return [v, v, v];
    });
    const lut = analyzeEnhancement(dark, ENHANCEMENT_PRESETS.auto).toneLut;
    const size = lut.length - 1;
    let slope = 0;
    for (let i = Math.ceil(0.02 * size); i < size; i++) slope = Math.max(slope, (lut[i + 1] - lut[i]) * size);
    expect(slope).toBeLessThanOrEqual(3 + 1e-3);
  });

  it("turns CLAHE off entirely for a photo whose tonal spread (L p5–p95) reaches 0.8", () => {
    const fullRamp = makeBuffer(400, 300, (x) => {
      const v = (x / 399) * 255;
      return [v, v, v];
    });
    expect(analyzeEnhancement(fullRamp, ENHANCEMENT_PRESETS.vivid).clahe).toBeNull();
  });

  it("sees both colors of a fine checkerboard whose period matches the sampling stride", () => {
    const checker = makeBuffer(2000, 1000, (x, y) => ((x + y) % 2 === 0 ? [40, 40, 40] : [200, 200, 200]));
    const lut = analyzeEnhancement(checker, ENHANCEMENT_PRESETS.auto).toneLut;
    const identity = lut.every((value, i) => Math.abs(value - i / (lut.length - 1)) < 1e-6);
    expect(identity).toBe(false);
  });

  // A third of the image at alpha 1 is ~0.2% of samples when weighted by alpha (under the 0.5% percentile tail), but a
  // third of all samples if alpha were ignored, which would drag the high percentile to white.
  it("weighs near-transparent pixels by their alpha in the statistics", () => {
    const withGhost = (ghostAlpha: number) => {
      const buffer = makeBuffer(300, 200, (x, y) => (x < 100 ? [250, 250, 250] : [40 + (y / 199) * 120, 40 + (y / 199) * 120, 40 + (y / 199) * 120]));
      for (let y = 0; y < 200; y++) for (let x = 0; x < 100; x++) buffer.data[(y * 300 + x) * 4 + 3] = ghostAlpha;
      return buffer;
    };
    const ghost = analyzeEnhancement(withGhost(1), ENHANCEMENT_PRESETS.auto).toneLut;
    const none = analyzeEnhancement(withGhost(0), ENHANCEMENT_PRESETS.auto).toneLut;
    let maxDifference = 0;
    for (let i = 0; i < ghost.length; i++) maxDifference = Math.max(maxDifference, Math.abs(ghost[i] - none[i]));
    expect(maxDifference).toBeLessThan(0.05);
  });

  it("applies full-resolution parameters to a downscaled preview consistently with the full result", () => {
    const params = analyzeEnhancement(degraded, ENHANCEMENT_PRESETS.vivid);
    const full = applyEnhancement(degraded, params);
    const half = makeBuffer(degraded.width / 2, degraded.height / 2, (x, y) => pixel(degraded, y * 2 * degraded.width + x * 2));
    const preview = applyEnhancement(half, params);
    const fullSubsampled = makeBuffer(half.width, half.height, (x, y) => pixel(full, y * 2 * degraded.width + x * 2));
    expect(meanDeltaE(preview, fullSubsampled)).toBeLessThan(0.01);
  });

  it("damps the tone-compensation chroma boost on skin, unlike on a non-skin colour of similar chroma", () => {
    const scene = makeBuffer(160, 80, (x, y) => {
      if (y < 40) return x < 80 ? [96, 60, 48] : [48, 72, 96]; // dark skin-hued and blue patches
      const v = 10 + (x / 159) * 60;
      return [v, v, v];
    });
    const result = enhancePixelBuffer(scene, "portrait");
    const skinGain = meanChroma(result, (x, y) => y < 40 && x < 80) / meanChroma(scene, (x, y) => y < 40 && x < 80);
    const blueGain = meanChroma(result, (x, y) => y < 40 && x >= 80) / meanChroma(scene, (x, y) => y < 40 && x >= 80);
    expect(skinGain).toBeLessThan(blueGain);
  });
});

describe("vibrance and skin", () => {
  it("recognises typical skin swatches and rejects green and saturated red", () => {
    const weightOf = (rgb: RGB) => {
      const [L, a, b] = rgbToOklab(rgb);
      return skinWeight(L, Math.hypot(a, b), Math.atan2(b, a));
    };
    expect(weightOf([224, 172, 138])).toBeGreaterThan(0.5);
    expect(weightOf([160, 100, 80])).toBeGreaterThan(0.5);
    expect(weightOf([60, 160, 70])).toBe(0);
    expect(weightOf([220, 30, 30])).toBe(0);
  });

  it("vibrance adds chroma to a pastel and much less to skin (same preset with and without vibrance)", () => {
    const scene = makeBuffer(120, 60, (x) => (x < 60 ? [120, 135, 165] : [224, 172, 138]));
    const isPastel = (x: number) => x < 60;
    const isSkin = (x: number) => x >= 60;
    for (const mode of MODES) {
      const preset = ENHANCEMENT_PRESETS[mode];
      const withVibrance = enhancePixelBufferWith(scene, preset);
      const without = enhancePixelBufferWith(scene, { ...preset, vibrance: { ...preset.vibrance, amount: 0 } });
      const pastelGain = meanChroma(withVibrance, isPastel) / meanChroma(without, isPastel);
      const skinGain = meanChroma(withVibrance, isSkin) / meanChroma(without, isSkin);
      expect(pastelGain, mode).toBeGreaterThan(1.02);
      expect(skinGain, mode).toBeLessThan(pastelGain);
      if (mode === "portrait") expect(skinGain).toBeLessThan(1.01);
    }
  });
});
