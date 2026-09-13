import { gamutMapOklabToLinear } from "../color/color";
import type { PixelBuffer } from "../types";

/**
 * Optional photo enhancement (G-032): content-adaptive white balance, levels, midtone gamma, CLAHE and vibrance, then
 * CSS Color 4 gamut mapping, all in OKLab. `analyzeEnhancement` measures a stratified sample of the full buffer, each
 * stage measuring the previous stage's output, and returns parameters; `applyEnhancement` is one fused per-pixel pass
 * that addresses CLAHE tiles by normalized position, so the same parameters apply to a downscaled preview. Off never
 * reaches this module. Constants are starting points (docs/domain-reference-photo-enhancement.md), calibrated in M2/M4.
 * See D112–D114.
 */

export type EnhancementModeId = "off" | "auto" | "vivid" | "portrait";

export interface EnhancementPreset {
  whiteBalance: { strength: number; brightBlend: number; maxGainRatio: number; maxChromaShift: number };
  levels: { lowPercentile: number; highPercentile: number; maxStretch: number };
  midtone: { bandLow: number; bandHigh: number; gammaMin: number; gammaMax: number };
  /** null disables CLAHE. `clip` is in Zuiderveld/OpenCV units (multiples of the uniform bin height). */
  clahe: { clip: number; blend: number; tilesLongSide: number; minTilePx: number } | null;
  vibrance: { amount: number; skinProtection: number };
}

export const ENHANCEMENT_PRESETS: Record<Exclude<EnhancementModeId, "off">, EnhancementPreset> = {
  auto: {
    whiteBalance: { strength: 0.7, brightBlend: 0.3, maxGainRatio: 1.25, maxChromaShift: 0.05 },
    levels: { lowPercentile: 0.005, highPercentile: 0.995, maxStretch: 2.5 },
    midtone: { bandLow: 0.5, bandHigh: 0.64, gammaMin: 0.67, gammaMax: 1.5 },
    clahe: { clip: 1.8, blend: 0.25, tilesLongSide: 8, minTilePx: 32 },
    vibrance: { amount: 0.2, skinProtection: 0.7 },
  },
  vivid: {
    whiteBalance: { strength: 0.7, brightBlend: 0.3, maxGainRatio: 1.25, maxChromaShift: 0.05 },
    levels: { lowPercentile: 0.005, highPercentile: 0.995, maxStretch: 2.5 },
    midtone: { bandLow: 0.5, bandHigh: 0.64, gammaMin: 0.67, gammaMax: 1.5 },
    clahe: { clip: 2.5, blend: 0.4, tilesLongSide: 8, minTilePx: 32 },
    vibrance: { amount: 0.4, skinProtection: 0.7 },
  },
  portrait: {
    whiteBalance: { strength: 0.5, brightBlend: 0.2, maxGainRatio: 1.15, maxChromaShift: 0.03 },
    levels: { lowPercentile: 0.002, highPercentile: 0.998, maxStretch: 1.8 },
    midtone: { bandLow: 0.52, bandHigh: 0.66, gammaMin: 0.8, gammaMax: 1.25 },
    clahe: null,
    vibrance: { amount: 0.15, skinProtection: 1 },
  },
};

/** Every mode a saved pattern or preference may name. Which modes are offered for new generation is a separate, UI-level release decision (D113). */
export const ENHANCEMENT_MODE_IDS: EnhancementModeId[] = ["off", "auto", "vivid", "portrait"];

export function isEnhancementModeId(value: unknown): value is EnhancementModeId {
  return typeof value === "string" && (ENHANCEMENT_MODE_IDS as string[]).includes(value);
}

/**
 * Modes offered for new generation. A mode joins only after passing the calibration gates (D113, D115); until then a
 * remembered preference naming it resolves to "off", while saved patterns still record whatever mode built them. A build
 * with NEXT_PUBLIC_ENHANCEMENT_PREVIEW=1 (only the Playwright build sets it) offers every recognized mode, so the UI can
 * be tested before release (D116). Read lazily, never at module load, so the workers that import this module don't need
 * `process`.
 */
export function releasedEnhancementModes(): readonly EnhancementModeId[] {
  return process.env.NEXT_PUBLIC_ENHANCEMENT_PREVIEW === "1" ? ENHANCEMENT_MODE_IDS : ["off"];
}

export function isReleasedEnhancementMode(value: unknown): value is EnhancementModeId {
  return typeof value === "string" && (releasedEnhancementModes() as readonly string[]).includes(value);
}

// White balance: sample eligibility and gates.
const WB_MAX_NEUTRAL_CHROMA = 0.05;
const WB_MAX_CHANNEL = 250;
const WB_MIN_L = 0.1;
const WB_MIN_ELIGIBLE_FRACTION = 0.05;
/** A real illuminant cast tints neutrals at every lightness; near-neutral samples all at one lightness are more likely one coloured surface (so a uniformly lit grey card is left alone too). */
const WB_MIN_NEUTRAL_L_SPREAD = 0.15;
const WB_DEADBAND_CHROMA = 0.01;
const WB_MINKOWSKI_P = 6;
const WB_BRIGHT_FRACTION = 0.03;
const MID_GREY_Y = 0.216; // OKLab L 0.6 for a neutral

// Levels, in OKLab L: L 0.2 ≈ sRGB 23, L 0.9 ≈ sRGB 222. A photo with real shadows and highlights is left alone, and a
// stretch stops short of pure black/white (L 0.1 ≈ sRGB 7, L 0.95 ≈ sRGB 240) so shadow detail doesn't become one thread.
const LEVELS_DEADBAND_LOW = 0.2;
const LEVELS_DEADBAND_HIGH = 0.9;
const LEVELS_MIN_SPREAD = 0.02;
const LEVELS_TARGET_LOW = 0.1;
const LEVELS_TARGET_HIGH = 0.95;
/** Largest slope the composed levels + gamma curve may have above L 0.02: bounds how much shadow noise it amplifies. */
const MAX_TONE_SLOPE = 3;
const TONE_SLOPE_FROM = 0.02;

const CHROMA_COMP_MIN = 0.8;
const CHROMA_COMP_MAX = 1.3;
/** tan 25° and tan 85°: the skin band's hue limits as b/a ratios, for a bounds test that avoids atan2. */
const SKIN_TAN_LOW = 0.4663;
const SKIN_TAN_HIGH = 11.43;

const CLAHE_BINS = 256;
const CLAHE_FLAT_SPREAD = 0.6;
const CLAHE_FULL_OFF_SPREAD = 0.8;
/** Below this many samples a tile's clip limit can't be honoured (the limit floors at one count), so the tile maps to identity. */
const CLAHE_MIN_TILE_SAMPLES = 1024;

const VIBRANCE_DEADBAND_START = 0.45;
const VIBRANCE_DEADBAND_END = 0.55;
const VIBRANCE_RAMP_LOW = 0.01;
const VIBRANCE_RAMP_HIGH = 0.03;

/** ~500k samples: stable percentiles and thousands per CLAHE tile, at half the analysis cost of 1 M. */
const TARGET_SAMPLES = 500_000;
const TONE_LUT_SIZE = 4096;
/** Resolution of the per-tile tone + CLAHE tables built for the pixel pass, indexed by original OKLab L. */
const COMBINED_LUT_SIZE = 1024;
const ENCODE_LUT_SIZE = 4096;
const CMAX_L_STEPS = 64;
const CMAX_H_STEPS = 72;

export interface EnhancementParameters {
  /** Multipliers on linear LMS (OKLab's M1 space). */
  gains: [number, number, number];
  /** L → L after levels and gamma, sampled at TONE_LUT_SIZE + 1 points over [0, 1]. */
  toneLut: Float32Array;
  /** Tile LUTs hold each tile's clipped CDF at bin upper edges; tiles are addressed by normalized image position. */
  clahe: { tilesX: number; tilesY: number; blend: number; luts: Float32Array } | null;
  vibranceAmount: number;
  skinProtection: number;
}

// ---- Color primitives on plain numbers ----

const DECODE = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const v = i / 255;
  DECODE[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

const ENCODE = new Uint8Array(ENCODE_LUT_SIZE + 1);
for (let i = 0; i <= ENCODE_LUT_SIZE; i++) {
  const v = i / ENCODE_LUT_SIZE;
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  ENCODE[i] = Math.round(Math.min(1, Math.max(0, c)) * 255);
}

function encodeLinear(v: number): number {
  if (v <= 0) return 0;
  if (v >= 1) return 255;
  return ENCODE[Math.round(v * ENCODE_LUT_SIZE)];
}

function lmsToLab(l: number, m: number, s: number, out: Float64Array): void {
  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);
  out[0] = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  out[1] = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  out[2] = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
}

function linearInGamut(L: number, a: number, b: number): boolean {
  const lc = L + 0.3963377774 * a + 0.2158037573 * b;
  const mc = L - 0.1055613458 * a - 0.0638541728 * b;
  const sc = L - 0.0894841775 * a - 1.291485548 * b;
  const l = lc * lc * lc;
  const m = mc * mc * mc;
  const s = sc * sc * sc;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return r >= -1e-6 && r <= 1.000001 && g >= -1e-6 && g <= 1.000001 && bl >= -1e-6 && bl <= 1.000001;
}

function ramp(x: number, from: number, to: number): number {
  return x <= from ? 0 : x >= to ? 1 : (x - from) / (to - from);
}

// ---- Maximum sRGB chroma by (L, hue), for relative saturation ----

let cmaxTable: Float32Array | null = null;

function cmaxLookupTable(): Float32Array {
  if (cmaxTable) return cmaxTable;
  const table = new Float32Array((CMAX_L_STEPS + 1) * CMAX_H_STEPS);
  for (let li = 0; li <= CMAX_L_STEPS; li++) {
    const L = li / CMAX_L_STEPS;
    for (let hi = 0; hi < CMAX_H_STEPS; hi++) {
      const h = (hi / CMAX_H_STEPS) * 2 * Math.PI;
      const ca = Math.cos(h);
      const sa = Math.sin(h);
      let low = 0;
      let high = 0.5;
      if (L > 0 && L < 1) {
        for (let step = 0; step < 24; step++) {
          const c = (low + high) / 2;
          if (linearInGamut(L, c * ca, c * sa)) low = c;
          else high = c;
        }
      }
      table[li * CMAX_H_STEPS + hi] = low;
    }
  }
  cmaxTable = table;
  return table;
}

function maxChroma(table: Float32Array, L: number, hue: number): number {
  const lf = Math.min(1, Math.max(0, L)) * CMAX_L_STEPS;
  const li = Math.min(CMAX_L_STEPS - 1, Math.floor(lf));
  const lt = lf - li;
  let hf = (hue / (2 * Math.PI)) * CMAX_H_STEPS;
  if (hf < 0) hf += CMAX_H_STEPS;
  const hi0 = Math.floor(hf) % CMAX_H_STEPS;
  const hi1 = (hi0 + 1) % CMAX_H_STEPS;
  const ht = hf - Math.floor(hf);
  const row0 = li * CMAX_H_STEPS;
  const row1 = (li + 1) * CMAX_H_STEPS;
  const top = table[row0 + hi0] * (1 - ht) + table[row0 + hi1] * ht;
  const bottom = table[row1 + hi0] * (1 - ht) + table[row1 + hi1] * ht;
  return top * (1 - lt) + bottom * lt;
}

/** 0..1 skin likelihood from OKLCh: full for hue 40–70°, falling off to 25° and 85°, with soft chroma and lightness gates. */
export function skinWeight(L: number, chroma: number, hueRadians: number): number {
  const gate = ramp(chroma, 0.01, 0.02) * (1 - ramp(chroma, 0.16, 0.2)) * ramp(L, 0.25, 0.3) * (1 - ramp(L, 0.92, 0.96));
  if (gate === 0) return 0;
  let deg = (hueRadians * 180) / Math.PI;
  if (deg < 0) deg += 360;
  const hueWeight = deg >= 40 && deg <= 70 ? 1 : deg > 25 && deg < 40 ? (deg - 25) / 15 : deg > 70 && deg < 85 ? (85 - deg) / 15 : 0;
  return gate * hueWeight;
}

/** Tone-driven chroma compensation (C × √(L′/L), clamped), with any boost damped on skin. */
function chromaCompensation(L0: number, L: number, skin: number, skinProtection: number): number {
  if (L0 <= 1e-4 || L === L0) return 1;
  let comp = Math.sqrt(L / L0);
  if (comp < CHROMA_COMP_MIN) comp = CHROMA_COMP_MIN;
  else if (comp > CHROMA_COMP_MAX) comp = CHROMA_COMP_MAX;
  if (comp > 1) comp = 1 + (comp - 1) * (1 - skinProtection * skin);
  return comp;
}

function vibranceBoost(table: Float32Array, L: number, chroma: number, hue: number, amount: number, skinProtection: number): number {
  const cmax = maxChroma(table, L, hue);
  const saturation = cmax > 1e-6 ? Math.min(1, chroma / cmax) : 1;
  const weight = (1 - saturation) * (1 - saturation) * ramp(chroma, VIBRANCE_RAMP_LOW, VIBRANCE_RAMP_HIGH) * (1 - skinProtection * skinWeight(L, chroma, hue));
  return 1 + amount * weight;
}

// ---- Analysis ----

interface Samples {
  count: number;
  /** Linear LMS before white balance. */
  lms: Float32Array;
  /** Original 8-bit max channel, for clipped-highlight exclusion. */
  maxChannel: Uint8Array;
  /** Normalized pixel-centre position, for CLAHE tiles. */
  u: Float32Array;
  v: Float32Array;
}

function hash2(x: number, y: number): number {
  let h = Math.imul(x + 1, 0x9e3779b1) ^ Math.imul(y + 1, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  return (h ^ (h >>> 15)) >>> 0;
}

/**
 * One deterministic, jittered sample per stride cell (a fixed offset can alias with periodic texture), accepted with
 * probability alpha/255 so a near-transparent area weighs as little as downsampling makes it.
 */
function collectSamples(source: PixelBuffer): Samples {
  const { width, height, data } = source;
  const stride = Math.max(1, Math.ceil(Math.sqrt((width * height) / TARGET_SAMPLES)));
  const cellsX = Math.ceil(width / stride);
  const cellsY = Math.ceil(height / stride);
  const capacity = cellsX * cellsY;
  const lms = new Float32Array(capacity * 3);
  const maxChannel = new Uint8Array(capacity);
  const us = new Float32Array(capacity);
  const vs = new Float32Array(capacity);
  let count = 0;
  for (let cy = 0; cy < cellsY; cy++) {
    for (let cx = 0; cx < cellsX; cx++) {
      const h = hash2(cx, cy);
      const x = Math.min(width - 1, cx * stride + (stride > 1 ? h % stride : 0));
      const y = Math.min(height - 1, cy * stride + (stride > 1 ? (h >>> 8) % stride : 0));
      const o = (y * width + x) * 4;
      const alpha = data[o + 3];
      if (alpha === 0 || (alpha < 255 && ((h >>> 16) & 255) >= alpha)) continue;
      const r = DECODE[data[o]];
      const g = DECODE[data[o + 1]];
      const b = DECODE[data[o + 2]];
      lms[count * 3] = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
      lms[count * 3 + 1] = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
      lms[count * 3 + 2] = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
      maxChannel[count] = Math.max(data[o], data[o + 1], data[o + 2]);
      us[count] = (x + 0.5) / width;
      vs[count] = (y + 0.5) / height;
      count++;
    }
  }
  return { count, lms, maxChannel, u: us, v: vs };
}

function percentile(sorted: Float32Array, fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))));
  return sorted[index];
}

/** Diagonal LMS gains from a capped, partial shades-of-grey estimate over near-neutral samples; identity when unsure. */
function estimateWhiteBalanceGains(samples: Samples, preset: EnhancementPreset["whiteBalance"]): [number, number, number] {
  const lab = new Float64Array(3);
  const eligible: number[] = [];
  const eligibleL: number[] = [];
  for (let i = 0; i < samples.count; i++) {
    if (samples.maxChannel[i] >= WB_MAX_CHANNEL) continue;
    lmsToLab(samples.lms[i * 3], samples.lms[i * 3 + 1], samples.lms[i * 3 + 2], lab);
    if (lab[0] < WB_MIN_L || Math.hypot(lab[1], lab[2]) >= WB_MAX_NEUTRAL_CHROMA) continue;
    eligible.push(i);
    eligibleL.push(lab[0]);
  }
  if (samples.count === 0 || eligible.length < WB_MIN_ELIGIBLE_FRACTION * samples.count) return [1, 1, 1];
  const sortedEligibleL = Float32Array.from(eligibleL).sort();
  if (percentile(sortedEligibleL, 0.9) - percentile(sortedEligibleL, 0.1) < WB_MIN_NEUTRAL_L_SPREAD) return [1, 1, 1];

  const minkowski = [0, 0, 0];
  for (const i of eligible) for (let c = 0; c < 3; c++) minkowski[c] += samples.lms[i * 3 + c] ** WB_MINKOWSKI_P;
  const greyEstimate = minkowski.map((sum) => (sum / eligible.length) ** (1 / WB_MINKOWSKI_P));

  const brightThreshold = percentile(sortedEligibleL, 1 - WB_BRIGHT_FRACTION);
  const bright = [0, 0, 0];
  let brightCount = 0;
  eligible.forEach((i, k) => {
    if (eligibleL[k] < brightThreshold) return;
    for (let c = 0; c < 3; c++) bright[c] += samples.lms[i * 3 + c];
    brightCount++;
  });

  const normalize = (v: number[]) => {
    const mean = (v[0] + v[1] + v[2]) / 3;
    return mean > 0 ? v.map((x) => x / mean) : [1, 1, 1];
  };
  const g = normalize(greyEstimate);
  const br = brightCount > 0 ? normalize(bright) : g;
  const estimate = [0, 1, 2].map((c) => (1 - preset.brightBlend) * g[c] + preset.brightBlend * br[c]);

  lmsToLab(estimate[0] * MID_GREY_Y, estimate[1] * MID_GREY_Y, estimate[2] * MID_GREY_Y, lab);
  if (Math.hypot(lab[1], lab[2]) < WB_DEADBAND_CHROMA) return [1, 1, 1];

  // Log-gains at partial strength, scaled down to respect the channel-ratio cap and, after the common normalization that
  // keeps mid-grey at L 0.6, the chroma shift the gains give mid-grey.
  const logGains = estimate.map((e) => preset.strength * -Math.log(Math.max(e, 1e-6)));
  const gainsAt = (k: number): [number, number, number] => {
    const raw = logGains.map((lg) => Math.exp(lg * k));
    lmsToLab(MID_GREY_Y * raw[0], MID_GREY_Y * raw[1], MID_GREY_Y * raw[2], lab);
    const norm = (0.6 / Math.max(lab[0], 1e-6)) ** 3;
    return [raw[0] * norm, raw[1] * norm, raw[2] * norm];
  };
  const shiftAt = (k: number) => {
    const gains = gainsAt(k);
    lmsToLab(MID_GREY_Y * gains[0], MID_GREY_Y * gains[1], MID_GREY_Y * gains[2], lab);
    return Math.hypot(lab[1], lab[2]);
  };
  const ratio = Math.exp(Math.max(...logGains) - Math.min(...logGains));
  let scale = ratio > preset.maxGainRatio ? Math.log(preset.maxGainRatio) / Math.log(ratio) : 1;
  if (shiftAt(scale) > preset.maxChromaShift) {
    let low = 0;
    let high = scale;
    for (let step = 0; step < 30; step++) {
      const mid = (low + high) / 2;
      if (shiftAt(mid) > preset.maxChromaShift) high = mid;
      else low = mid;
    }
    scale = low;
  }
  return gainsAt(scale);
}

/** Levels as [inLow, inHigh, outLow, outHigh], or null for identity. A capped stretch stays centred on the input range, so high-key and low-key photos keep their brightness. */
export function planLevels(sortedL: Float32Array, preset: EnhancementPreset["levels"]): [number, number, number, number] | null {
  const low = percentile(sortedL, preset.lowPercentile);
  const high = percentile(sortedL, preset.highPercentile);
  if (high - low < LEVELS_MIN_SPREAD) return null;
  if (low <= LEVELS_DEADBAND_LOW && high >= LEVELS_DEADBAND_HIGH) return null;
  let outLow = Math.min(low, LEVELS_TARGET_LOW);
  let outHigh = Math.max(high, LEVELS_TARGET_HIGH);
  if ((outHigh - outLow) / (high - low) > preset.maxStretch) {
    const center = (low + high) / 2;
    const half = ((high - low) * preset.maxStretch) / 2;
    outLow = center - half;
    outHigh = center + half;
    if (outLow < 0) {
      outHigh -= outLow;
      outLow = 0;
    }
    if (outHigh > 1) {
      outLow = Math.max(0, outLow - (outHigh - 1));
      outHigh = 1;
    }
  }
  return [low, high, outLow, outHigh];
}

/** Gamma moving the median to the nearest band edge, clamped; 1 when the median is already in the band. */
export function planGamma(median: number, preset: EnhancementPreset["midtone"]): number {
  if (median <= 0 || median >= 1) return 1;
  const target = median < preset.bandLow ? preset.bandLow : median > preset.bandHigh ? preset.bandHigh : median;
  if (target === median) return 1;
  const gamma = Math.log(target) / Math.log(median);
  return Math.min(preset.gammaMax, Math.max(preset.gammaMin, gamma));
}

/** Monotone piecewise-linear levels through (0,0), (inLow,outLow), (inHigh,outHigh), (1,1): a toe and shoulder instead of a hard clip. */
function levelsCurve(v: number, [inLow, inHigh, outLow, outHigh]: [number, number, number, number]): number {
  if (v <= inLow) return inLow > 0 ? (v / inLow) * outLow : outLow;
  if (v >= inHigh) return inHigh < 1 ? outHigh + ((v - inHigh) / (1 - inHigh)) * (1 - outHigh) : outHigh;
  return outLow + ((v - inLow) * (outHigh - outLow)) / (inHigh - inLow);
}

function buildToneLut(levels: [number, number, number, number] | null, gamma: number): Float32Array {
  const lut = new Float32Array(TONE_LUT_SIZE + 1);
  for (let i = 0; i <= TONE_LUT_SIZE; i++) {
    let v = i / TONE_LUT_SIZE;
    if (levels) v = Math.min(1, Math.max(0, levelsCurve(v, levels)));
    lut[i] = gamma === 1 ? v : Math.pow(v, gamma);
  }
  return lut;
}

function maxToneSlope(lut: Float32Array): number {
  let slope = 0;
  for (let i = Math.ceil(TONE_SLOPE_FROM * TONE_LUT_SIZE); i < TONE_LUT_SIZE; i++) slope = Math.max(slope, (lut[i + 1] - lut[i]) * TONE_LUT_SIZE);
  return slope;
}

/** The tone LUT, with gamma pulled toward 1 as far as needed to keep the composed slope within MAX_TONE_SLOPE. */
export function planToneLut(levels: [number, number, number, number] | null, gamma: number): Float32Array {
  let lut = buildToneLut(levels, gamma);
  if (gamma === 1 || maxToneSlope(lut) <= MAX_TONE_SLOPE) return lut;
  let allowed = 0;
  let excessive = 1;
  for (let step = 0; step < 20; step++) {
    const t = (allowed + excessive) / 2;
    if (maxToneSlope(buildToneLut(levels, 1 + (gamma - 1) * t)) <= MAX_TONE_SLOPE) allowed = t;
    else excessive = t;
  }
  lut = buildToneLut(levels, 1 + (gamma - 1) * allowed);
  return lut;
}

function toneLookup(lut: Float32Array, L: number): number {
  let f = L * TONE_LUT_SIZE;
  if (f < 0) f = 0;
  else if (f > TONE_LUT_SIZE) f = TONE_LUT_SIZE;
  const i = f < TONE_LUT_SIZE ? f | 0 : TONE_LUT_SIZE - 1;
  return lut[i] + (lut[i + 1] - lut[i]) * (f - i);
}

function tileGrid(width: number, height: number, preset: NonNullable<EnhancementPreset["clahe"]>): [number, number] | null {
  const longSide = Math.max(width, height);
  const shortSide = Math.min(width, height);
  const tilesLong = Math.min(preset.tilesLongSide, Math.floor(longSide / preset.minTilePx));
  const tilesShort = Math.min(Math.round((tilesLong * shortSide) / longSide), Math.floor(shortSide / preset.minTilePx));
  if (tilesLong < 2 || tilesShort < 2) return null;
  return width >= height ? [tilesLong, tilesShort] : [tilesShort, tilesLong];
}

/** Clip-limited, redistributed, normalized CDF per tile at bin upper edges; under-sampled tiles map to identity. */
function buildClaheLuts(tileL: number[][], clip: number): Float32Array {
  const luts = new Float32Array(tileL.length * CLAHE_BINS);
  const histogram = new Float64Array(CLAHE_BINS);
  tileL.forEach((values, tile) => {
    const base = tile * CLAHE_BINS;
    if (values.length < CLAHE_MIN_TILE_SAMPLES) {
      for (let j = 0; j < CLAHE_BINS; j++) luts[base + j] = (j + 1) / CLAHE_BINS;
      return;
    }
    histogram.fill(0);
    for (const v of values) histogram[Math.min(CLAHE_BINS - 1, Math.max(0, Math.floor(v * CLAHE_BINS)))]++;
    const limit = (clip * values.length) / CLAHE_BINS;
    let excess = 0;
    for (let j = 0; j < CLAHE_BINS; j++) {
      if (histogram[j] > limit) {
        excess += histogram[j] - limit;
        histogram[j] = limit;
      }
    }
    const add = excess / CLAHE_BINS;
    let cumulative = 0;
    for (let j = 0; j < CLAHE_BINS; j++) {
      cumulative += histogram[j] + add;
      luts[base + j] = cumulative / values.length;
    }
  });
  return luts;
}

/**
 * Four tile CDFs read at L and interpolated bilinearly. Entry j of a CDF sits at the bin's upper edge (j + 1) / BINS and
 * the curve starts at (0, 0); the bin position is computed once for all four tiles.
 */
function claheBilinear(luts: Float32Array, base00: number, base10: number, base01: number, base11: number, tx: number, ty: number, L: number): number {
  const f = L * CLAHE_BINS - 1;
  let v00: number;
  let v10: number;
  let v01: number;
  let v11: number;
  if (f <= 0) {
    const w = f <= -1 ? 0 : f + 1;
    v00 = luts[base00] * w;
    v10 = luts[base10] * w;
    v01 = luts[base01] * w;
    v11 = luts[base11] * w;
  } else if (f >= CLAHE_BINS - 1) {
    v00 = luts[base00 + CLAHE_BINS - 1];
    v10 = luts[base10 + CLAHE_BINS - 1];
    v01 = luts[base01 + CLAHE_BINS - 1];
    v11 = luts[base11 + CLAHE_BINS - 1];
  } else {
    const j = f | 0;
    const t = f - j;
    v00 = luts[base00 + j] + (luts[base00 + j + 1] - luts[base00 + j]) * t;
    v10 = luts[base10 + j] + (luts[base10 + j + 1] - luts[base10 + j]) * t;
    v01 = luts[base01 + j] + (luts[base01 + j + 1] - luts[base01 + j]) * t;
    v11 = luts[base11 + j] + (luts[base11 + j + 1] - luts[base11 + j]) * t;
  }
  const top = v00 + (v10 - v00) * tx;
  const bottom = v01 + (v11 - v01) * tx;
  return top + (bottom - top) * ty;
}

/** Tile interpolation coordinates for a normalized position along one axis: [lower tile, upper tile, fraction]. */
function tileAxis(position: number, tiles: number): [number, number, number] {
  const f = Math.min(tiles - 1, Math.max(0, position * tiles - 0.5));
  const t0 = Math.floor(f);
  return [t0, Math.min(tiles - 1, t0 + 1), f - t0];
}

function claheAt(clahe: NonNullable<EnhancementParameters["clahe"]>, u: number, v: number, L: number): number {
  const [x0, x1, tx] = tileAxis(u, clahe.tilesX);
  const [y0, y1, ty] = tileAxis(v, clahe.tilesY);
  const w = clahe.tilesX;
  return claheBilinear(clahe.luts, (y0 * w + x0) * CLAHE_BINS, (y0 * w + x1) * CLAHE_BINS, (y1 * w + x0) * CLAHE_BINS, (y1 * w + x1) * CLAHE_BINS, tx, ty, L);
}

export function analyzeEnhancement(source: PixelBuffer, preset: EnhancementPreset): EnhancementParameters {
  const samples = collectSamples(source);
  const gains = estimateWhiteBalanceGains(samples, preset.whiteBalance);
  const lab = new Float64Array(3);

  const labs = new Float32Array(samples.count * 3);
  for (let i = 0; i < samples.count; i++) {
    lmsToLab(samples.lms[i * 3] * gains[0], samples.lms[i * 3 + 1] * gains[1], samples.lms[i * 3 + 2] * gains[2], lab);
    labs[i * 3] = lab[0];
    labs[i * 3 + 1] = lab[1];
    labs[i * 3 + 2] = lab[2];
  }

  const sortedL = new Float32Array(samples.count);
  for (let i = 0; i < samples.count; i++) sortedL[i] = labs[i * 3];
  sortedL.sort();
  const levels = planLevels(sortedL, preset.levels);
  const levelsOnly = buildToneLut(levels, 1);
  const sortedLeveled = new Float32Array(samples.count);
  for (let i = 0; i < samples.count; i++) sortedLeveled[i] = toneLookup(levelsOnly, labs[i * 3]);
  sortedLeveled.sort();
  const toneLut = planToneLut(levels, planGamma(percentile(sortedLeveled, 0.5), preset.midtone));

  const toned = new Float32Array(samples.count);
  for (let i = 0; i < samples.count; i++) toned[i] = toneLookup(toneLut, labs[i * 3]);

  let clahe: EnhancementParameters["clahe"] = null;
  const grid = preset.clahe ? tileGrid(source.width, source.height, preset.clahe) : null;
  if (preset.clahe && grid && samples.count > 0) {
    const sortedToned = Float32Array.from(toned).sort();
    const spread = percentile(sortedToned, 0.95) - percentile(sortedToned, 0.05);
    const flatness = 1 - ramp(spread, CLAHE_FLAT_SPREAD, CLAHE_FULL_OFF_SPREAD);
    if (flatness > 0) {
      const [tilesX, tilesY] = grid;
      const tileL: number[][] = Array.from({ length: tilesX * tilesY }, () => []);
      for (let i = 0; i < samples.count; i++) {
        const tx = Math.min(tilesX - 1, Math.floor(samples.u[i] * tilesX));
        const ty = Math.min(tilesY - 1, Math.floor(samples.v[i] * tilesY));
        tileL[ty * tilesX + tx].push(toned[i]);
      }
      const clip = 1 + (preset.clahe.clip - 1) * flatness;
      clahe = { tilesX, tilesY, blend: preset.clahe.blend * flatness, luts: buildClaheLuts(tileL, clip) };
    }
  }

  // Vibrance deadband, measured on the same chroma the pixel pass will see (after tone compensation).
  let vibranceAmount = preset.vibrance.amount;
  const skinProtection = preset.vibrance.skinProtection;
  if (vibranceAmount > 0 && samples.count > 0) {
    const table = cmaxLookupTable();
    let weightedSaturation = 0;
    let weight = 0;
    for (let i = 0; i < samples.count; i++) {
      const L0 = labs[i * 3];
      let L = toned[i];
      if (clahe) L += clahe.blend * (claheAt(clahe, samples.u[i], samples.v[i], L) - L);
      const a0 = labs[i * 3 + 1];
      const b0 = labs[i * 3 + 2];
      const hue = Math.atan2(b0, a0);
      const chroma0 = Math.sqrt(a0 * a0 + b0 * b0);
      const chroma = chroma0 * chromaCompensation(L0, L, skinWeight(L, chroma0, hue), skinProtection);
      const nonSkin = 1 - skinWeight(L, chroma, hue);
      if (nonSkin <= 0) continue;
      const cmax = maxChroma(table, L, hue);
      weightedSaturation += nonSkin * (cmax > 1e-6 ? Math.min(1, chroma / cmax) : 1);
      weight += nonSkin;
    }
    if (weight > 0) vibranceAmount *= 1 - ramp(weightedSaturation / weight, VIBRANCE_DEADBAND_START, VIBRANCE_DEADBAND_END);
  }

  return { gains, toneLut, clahe, vibranceAmount, skinProtection };
}

// ---- Fused application ----

/**
 * Applies analysed parameters in one pass, returning a new buffer. CLAHE tiles are addressed by normalized position, so
 * parameters analysed at full resolution also apply to a downscaled preview. Alpha and fully transparent pixels are
 * copied unchanged.
 */
export function applyEnhancement(source: PixelBuffer, params: EnhancementParameters): PixelBuffer {
  const { width, height, data } = source;
  const out = new Uint8ClampedArray(data.length);
  // Writes go through a plain byte view: every value written is already an integer in 0–255, so clamping is wasted work.
  const bytes = new Uint8Array(out.buffer);
  const vibranceAmount = params.vibranceAmount;
  const skinProtection = params.skinProtection;
  const table = vibranceAmount > 0 ? cmaxLookupTable() : null;
  const gl = params.gains[0];
  const gm = params.gains[1];
  const gs = params.gains[2];
  const toneLut = params.toneLut;
  const clahe = params.clahe;
  const linear = new Float64Array(3);

  // With CLAHE, each tile gets one table over the ORIGINAL L: tone(L0) + blend·(cdf(tone(L0)) − tone(L0)). Bilinear tile
  // weights sum to 1, so interpolating these tables equals tone lookup followed by the blended CLAHE lookup, minus a read.
  const combinedStride = COMBINED_LUT_SIZE + 1;
  let combined: Float32Array | null = null;
  let columnBase0: Int32Array | null = null;
  let columnBase1: Int32Array | null = null;
  let columnT: Float32Array | null = null;
  if (clahe) {
    const tiles = clahe.tilesX * clahe.tilesY;
    combined = new Float32Array(tiles * combinedStride);
    for (let tile = 0; tile < tiles; tile++) {
      const lutBase = tile * CLAHE_BINS;
      for (let i = 0; i <= COMBINED_LUT_SIZE; i++) {
        const toned = toneLookup(toneLut, i / COMBINED_LUT_SIZE);
        const cdf = claheBilinear(clahe.luts, lutBase, lutBase, lutBase, lutBase, 0, 0, toned);
        combined[tile * combinedStride + i] = toned + clahe.blend * (cdf - toned);
      }
    }
    columnBase0 = new Int32Array(width);
    columnBase1 = new Int32Array(width);
    columnT = new Float32Array(width);
    for (let x = 0; x < width; x++) {
      const [t0, t1, t] = tileAxis((x + 0.5) / width, clahe.tilesX);
      columnBase0[x] = t0;
      columnBase1[x] = t1;
      columnT[x] = t;
    }
  }

  for (let y = 0; y < height; y++) {
    let row0 = 0;
    let row1 = 0;
    let rowT = 0;
    if (clahe) {
      const [t0, t1, t] = tileAxis((y + 0.5) / height, clahe.tilesY);
      row0 = t0 * clahe.tilesX;
      row1 = t1 * clahe.tilesX;
      rowT = t;
    }
    const rowOffset = y * width;
    for (let x = 0; x < width; x++) {
      const o = (rowOffset + x) * 4;
      const alpha = data[o + 3];
      bytes[o + 3] = alpha;
      if (alpha === 0) {
        bytes[o] = data[o];
        bytes[o + 1] = data[o + 1];
        bytes[o + 2] = data[o + 2];
        continue;
      }
      const r = DECODE[data[o]];
      const g = DECODE[data[o + 1]];
      const b = DECODE[data[o + 2]];
      const l_ = Math.cbrt((0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) * gl);
      const m_ = Math.cbrt((0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) * gm);
      const s_ = Math.cbrt((0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) * gs);
      const L0 = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
      let a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
      let bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

      let L: number;
      if (combined) {
        let f = L0 * COMBINED_LUT_SIZE;
        if (f < 0) f = 0;
        else if (f > COMBINED_LUT_SIZE) f = COMBINED_LUT_SIZE;
        const i = f < COMBINED_LUT_SIZE ? f | 0 : COMBINED_LUT_SIZE - 1;
        const t = f - i;
        const cx0 = columnBase0![x];
        const cx1 = columnBase1![x];
        const b00 = (row0 + cx0) * combinedStride + i;
        const b10 = (row0 + cx1) * combinedStride + i;
        const b01 = (row1 + cx0) * combinedStride + i;
        const b11 = (row1 + cx1) * combinedStride + i;
        const v00 = combined[b00] + (combined[b00 + 1] - combined[b00]) * t;
        const v10 = combined[b10] + (combined[b10 + 1] - combined[b10]) * t;
        const v01 = combined[b01] + (combined[b01 + 1] - combined[b01]) * t;
        const v11 = combined[b11] + (combined[b11 + 1] - combined[b11]) * t;
        const tx = columnT![x];
        const top = v00 + (v10 - v00) * tx;
        L = top + (v01 + (v11 - v01) * tx - top) * rowT;
      } else {
        L = toneLookup(toneLut, L0);
      }

      const dL = L - L0;
      if (L0 > 1e-4 && (dL > 1e-6 || dL < -1e-6)) {
        let comp = Math.sqrt(L / L0);
        if (comp > 1) {
          // Only a boost needs skin damping. A cheap bounds test (hue 25–85°, i.e. a > 0 and tan 25° ≤ b/a ≤ tan 85°, plus
          // the chroma and lightness gates) rules skin out for most pixels before paying for sqrt and atan2.
          const c2 = a * a + bb * bb;
          if (a > 0 && bb >= SKIN_TAN_LOW * a && bb <= SKIN_TAN_HIGH * a && c2 > 1e-4 && c2 < 0.04 && L > 0.25 && L < 0.96) {
            comp = chromaCompensation(L0, L, skinWeight(L, Math.sqrt(c2), Math.atan2(bb, a)), skinProtection);
          } else if (comp > CHROMA_COMP_MAX) {
            comp = CHROMA_COMP_MAX;
          }
        } else if (comp < CHROMA_COMP_MIN) {
          comp = CHROMA_COMP_MIN;
        }
        a *= comp;
        bb *= comp;
      }
      if (table) {
        const chroma = Math.sqrt(a * a + bb * bb);
        if (chroma > VIBRANCE_RAMP_LOW) {
          const boost = vibranceBoost(table, L, chroma, Math.atan2(bb, a), vibranceAmount, skinProtection);
          a *= boost;
          bb *= boost;
        }
      }

      // Fast path: most pixels are in gamut after moderate adjustments.
      const lc = L + 0.3963377774 * a + 0.2158037573 * bb;
      const mc = L - 0.1055613458 * a - 0.0638541728 * bb;
      const sc = L - 0.0894841775 * a - 1.291485548 * bb;
      const lk = lc * lc * lc;
      const mk = mc * mc * mc;
      const sk = sc * sc * sc;
      const rr = 4.0767416621 * lk - 3.3077115913 * mk + 0.2309699292 * sk;
      const gg = -1.2684380046 * lk + 2.6097574011 * mk - 0.3413193965 * sk;
      const bl = -0.0041960863 * lk - 0.7034186147 * mk + 1.707614701 * sk;
      if (L > 0 && L < 1 && rr >= 0 && rr <= 1 && gg >= 0 && gg <= 1 && bl >= 0 && bl <= 1) {
        bytes[o] = ENCODE[(rr * ENCODE_LUT_SIZE + 0.5) | 0];
        bytes[o + 1] = ENCODE[(gg * ENCODE_LUT_SIZE + 0.5) | 0];
        bytes[o + 2] = ENCODE[(bl * ENCODE_LUT_SIZE + 0.5) | 0];
      } else {
        gamutMapOklabToLinear(L, a, bb, linear);
        bytes[o] = encodeLinear(linear[0]);
        bytes[o + 1] = encodeLinear(linear[1]);
        bytes[o + 2] = encodeLinear(linear[2]);
      }
    }
  }
  return { data: out, width, height };
}

/** Off returns the source object itself, so the pipeline's input bytes and identity are untouched. */
export function enhancePixelBuffer(source: PixelBuffer, mode: EnhancementModeId): PixelBuffer {
  if (mode === "off") return source;
  return applyEnhancement(source, analyzeEnhancement(source, ENHANCEMENT_PRESETS[mode]));
}
