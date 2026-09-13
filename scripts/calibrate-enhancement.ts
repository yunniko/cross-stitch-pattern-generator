import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { oklabDistanceSquared, rgbToOklab } from "@/lib/color/color";
import { computePatternDiagnostics } from "@/lib/experimental/diagnostics";
import { downsampleToGrid } from "@/lib/pipeline/downsample";
import { analyzeEnhancement, applyEnhancement, ENHANCEMENT_PRESETS } from "@/lib/pipeline/enhance";
import { buildPattern } from "@/lib/pipeline/pattern";
import type { PixelBuffer, StitchPattern } from "@/lib/types";

/**
 * Real-photo calibration for photo enhancement (G-032 M4): `npm run calibrate:enhancement` with
 * ENHANCEMENT_PHOTOS_DIR pointing at decoded photos (<name>.rgba raw RGBA plus <name>.json {width,height}) and
 * ENHANCEMENT_CALIBRATION_OUT naming the JSON report to write. The photos are not in the repository; their sources and
 * licences are listed in docs/reviews/2026-09-13-photo-enhancement-calibration.md.
 *
 * RELEASE_RULE was fixed before any real photo was measured. A mode is released only if every clause holds (D113, D115).
 */

export const RELEASE_RULE = {
  /** Well-exposed photos: boundary agreement between the mode's pattern and Off's (neighbouring cells share a colour in both). */
  doNoHarmMinAgreement: 0.9,
  /** Benefit, clause A: the real underexposed tree panel, compared against the normal panel's Off pattern, beats Off by this. */
  realRecoveryMinGain: 0.03,
  /** Benefit, clause B: synthetic degradation of the well-exposed photos, mean gain over Off. Either A or B suffices. */
  syntheticRecoveryMinMeanGain: 0.05,
  /** Flawed photos: the count-weighted palette lightness span (L p5–p95) must widen by this much... */
  flawedMinTonalSpanGain: 0.05,
  /** ...on at least this share of them. */
  flawedMinShareImproved: 0.6,
  /** On no flawed photo may confetti rise more than this, or near-duplicate palette pairs rise by more than one. */
  maxConfettiRise: 0.02,
  maxExtraNearDuplicatePairs: 1,
  nearDuplicateDistance: 0.03,
  /** An intentional warm cast (sunset) must survive: white balance may shift mid-grey chroma by at most this. */
  intentionalCastMaxGreyShift: 0.02,
} as const;

const WELL_EXPOSED = ["lake-summer", "road-mountains", "portrait-winter", "portrait-headwrap", "tree-normal"];
const FLAWED = ["underexposed-sun", "fog-sailboat", "fog-brofjorden", "fog-eucalypt", "backlit-tower", "backlit-geyser", "tree-under"];
const INTENTIONAL_CAST = "sunset-margarita";
const MODES = ["auto", "vivid", "portrait"] as const;
const OPTIONS = { longerSideStitches: 150, colorCount: 24 } as const;

const photosDir = process.env.ENHANCEMENT_PHOTOS_DIR;
const outPath = process.env.ENHANCEMENT_CALIBRATION_OUT;

function loadPhoto(name: string): PixelBuffer {
  const { width, height } = JSON.parse(readFileSync(path.join(photosDir!, `${name}.json`), "utf8")) as { width: number; height: number };
  const bytes = readFileSync(path.join(photosDir!, `${name}.rgba`));
  return { data: new Uint8ClampedArray(bytes.buffer, bytes.byteOffset, bytes.byteLength), width, height };
}

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (v: number) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
};

/** The same degradation as tests/unit/enhancement-calibration.spec.ts: −1 EV, 40% contrast, warm cast, in linear light. */
function degrade(source: PixelBuffer): PixelBuffer {
  const cast = [1.1, 1, 0.85];
  const data = new Uint8ClampedArray(source.data.length);
  for (let o = 0; o < data.length; o += 4) {
    for (let c = 0; c < 3; c++) data[o + c] = toSrgb((0.09 + (toLinear(source.data[o + c]) * 0.5 - 0.09) * 0.4) * cast[c]);
    data[o + 3] = source.data[o + 3];
  }
  return { data, width: source.width, height: source.height };
}

function boundaryAgreement(pattern: StitchPattern, reference: StitchPattern): number {
  if (pattern.width !== reference.width || pattern.height !== reference.height) throw new Error("patterns differ in size");
  const { width, height } = pattern;
  let agree = 0;
  let total = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      for (const j of [x + 1 < width ? i + 1 : -1, y + 1 < height ? i + width : -1]) {
        if (j < 0) continue;
        total++;
        if ((pattern.cellPalette[i] === pattern.cellPalette[j]) === (reference.cellPalette[i] === reference.cellPalette[j])) agree++;
      }
    }
  }
  return total > 0 ? agree / total : 1;
}

/** Count-weighted palette lightness span (OKLab L, p5 to p95): how much of the tonal range the stitched colours use. */
function tonalSpan(pattern: StitchPattern): number {
  const entries = pattern.palette.map((c) => ({ L: rgbToOklab(c.rgb)[0], count: c.count })).sort((a, b) => a.L - b.L);
  const total = entries.reduce((sum, e) => sum + e.count, 0);
  const at = (fraction: number) => {
    let cumulative = 0;
    for (const e of entries) {
      cumulative += e.count;
      if (cumulative >= fraction * total) return e.L;
    }
    return entries[entries.length - 1].L;
  };
  return at(0.95) - at(0.05);
}

function nearDuplicatePairs(pattern: StitchPattern): number {
  const colors = pattern.palette.map((c) => rgbToOklab(c.rgb));
  const limit = RELEASE_RULE.nearDuplicateDistance ** 2;
  let pairs = 0;
  for (let i = 0; i < colors.length; i++) for (let j = i + 1; j < colors.length; j++) if (oklabDistanceSquared(colors[i], colors[j]) < limit) pairs++;
  return pairs;
}

function confetti(pattern: StitchPattern, source: PixelBuffer): number {
  return computePatternDiagnostics(pattern, downsampleToGrid(source, pattern.width, pattern.height)).confettiRatio;
}

/** Chroma a neutral mid-grey gains from the white balance analysed on `photo`. */
function greyShift(photo: PixelBuffer, mode: (typeof MODES)[number]): number {
  const params = analyzeEnhancement(photo, ENHANCEMENT_PRESETS[mode]);
  const grey = new Uint8ClampedArray([128, 128, 128, 255]);
  const out = applyEnhancement({ data: grey, width: 1, height: 1 }, { ...params, toneLut: Float32Array.from({ length: params.toneLut.length }, (_, i) => i / (params.toneLut.length - 1)), clahe: null, vibranceAmount: 0 });
  const [, a, b] = rgbToOklab([out.data[0], out.data[1], out.data[2]]);
  return Math.hypot(a, b);
}

it.skipIf(!photosDir)(
  "calibrates enhancement modes on real photos",
  () => {
    const photos = new Map<string, PixelBuffer>();
    const photo = (name: string) => {
      if (!photos.has(name)) photos.set(name, loadPhoto(name));
      return photos.get(name)!;
    };
    const offPatterns = new Map<string, StitchPattern>();
    const off = (key: string, source: PixelBuffer) => {
      if (!offPatterns.has(key)) offPatterns.set(key, buildPattern(source, OPTIONS));
      return offPatterns.get(key)!;
    };

    const report: Record<string, unknown> = { rule: RELEASE_RULE, options: OPTIONS };
    for (const mode of MODES) {
      const started = performance.now();
      const clauses: Record<string, boolean> = {};
      const metrics: Record<string, unknown> = {};

      const doNoHarm = WELL_EXPOSED.map((name) => {
        const agreement = boundaryAgreement(buildPattern(photo(name), { ...OPTIONS, enhancementMode: mode }), off(name, photo(name)));
        return { name, agreement };
      });
      metrics.doNoHarm = doNoHarm;
      clauses.doNoHarm = doNoHarm.every((d) => d.agreement >= RELEASE_RULE.doNoHarmMinAgreement);

      const reference = off("tree-normal", photo("tree-normal"));
      const realOff = boundaryAgreement(off("tree-under", photo("tree-under")), reference);
      const realMode = boundaryAgreement(buildPattern(photo("tree-under"), { ...OPTIONS, enhancementMode: mode }), reference);
      metrics.realRecovery = { off: realOff, mode: realMode, gain: realMode - realOff };

      const synthetic = WELL_EXPOSED.map((name) => {
        const degraded = degrade(photo(name));
        const ref = off(name, photo(name));
        const offAgreement = boundaryAgreement(off(`${name}:degraded`, degraded), ref);
        const modeAgreement = boundaryAgreement(buildPattern(degraded, { ...OPTIONS, enhancementMode: mode }), ref);
        return { name, off: offAgreement, mode: modeAgreement, gain: modeAgreement - offAgreement };
      });
      const meanSyntheticGain = synthetic.reduce((sum, s) => sum + s.gain, 0) / synthetic.length;
      metrics.syntheticRecovery = { photos: synthetic, meanGain: meanSyntheticGain };
      clauses.benefit = realMode - realOff >= RELEASE_RULE.realRecoveryMinGain || meanSyntheticGain >= RELEASE_RULE.syntheticRecoveryMinMeanGain;

      const flawed = FLAWED.map((name) => {
        const offPattern = off(name, photo(name));
        const modePattern = buildPattern(photo(name), { ...OPTIONS, enhancementMode: mode });
        return {
          name,
          spanOff: tonalSpan(offPattern),
          spanMode: tonalSpan(modePattern),
          confettiOff: confetti(offPattern, photo(name)),
          confettiMode: confetti(modePattern, photo(name)),
          nearDuplicatesOff: nearDuplicatePairs(offPattern),
          nearDuplicatesMode: nearDuplicatePairs(modePattern),
        };
      });
      metrics.flawed = flawed;
      const improvedShare = flawed.filter((f) => f.spanMode - f.spanOff >= RELEASE_RULE.flawedMinTonalSpanGain).length / flawed.length;
      clauses.tonalRange = improvedShare >= RELEASE_RULE.flawedMinShareImproved;
      clauses.noConfettiOrDuplicates = flawed.every((f) => f.confettiMode - f.confettiOff <= RELEASE_RULE.maxConfettiRise && f.nearDuplicatesMode - f.nearDuplicatesOff <= RELEASE_RULE.maxExtraNearDuplicatePairs);

      const castShift = greyShift(photo(INTENTIONAL_CAST), mode);
      metrics.intentionalCast = { greyShift: castShift };
      clauses.keepsIntentionalCast = castShift <= RELEASE_RULE.intentionalCastMaxGreyShift;

      const released = Object.values(clauses).every(Boolean);
      report[mode] = { released, clauses, metrics, seconds: (performance.now() - started) / 1000 };
      console.log(`${mode}: released=${released} ${JSON.stringify(clauses)}`);
      if (outPath) writeFileSync(outPath, JSON.stringify(report, null, 2));
    }
  },
  0
);
