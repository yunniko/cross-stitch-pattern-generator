import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { oklabDistanceSquared, rgbToOklab, type Oklab } from "@/lib/color/color";
import { computePatternDiagnostics } from "@/lib/experimental/diagnostics";
import { downsampleToGrid } from "@/lib/pipeline/downsample";
import { analyzeEnhancement, ENHANCEMENT_PRESETS, releasedEnhancementModes } from "@/lib/pipeline/enhance";
import { buildPattern } from "@/lib/pipeline/pattern";
import { EMPTY_CELL, type PixelBuffer, type RGB, type StitchPattern } from "@/lib/types";
import { makeBuffer, makePhotoLikeBuffer, pseudoNoise } from "./helpers/fixtures";

/**
 * G-032 M2: gates for enhancement modes (criteria 2, 3e, 3f; D113, D115). Releasing a mode is the Owner's decision
 * (D118), so every mode must pass the safety gates (do no harm, noise, thread palette), while recovery is measured and
 * reported without failing the suite. Set ENHANCEMENT_CALIBRATION_REPORT=<path> to write the measurements as JSON.
 *
 * Recovery and do-no-harm compare region boundaries (do two neighbouring cells share a colour?), not exact colours. The
 * first run gated on colour agreement within ΔE 0.06, and even the undegraded photos scored 0.08–0.51 against their own
 * Off pattern: it measured that enhancement changes tone, which is its purpose, rather than recovery or harm. Colour
 * agreement is still reported, ungated (D115).
 */

const MODES = ["brighten", "auto", "vivid", "portrait"] as const;
type Mode = (typeof MODES)[number];

export const RELEASE_GATES = {
  /** Reported only: OKLab distance under which a cell's colour in two patterns counts as the same colour. */
  cellAgreementTolerance: 0.06,
  /** Criterion 2: on a degraded copy, share of neighbouring-cell pairs whose same/different-colour status matches the undegraded photo's Off pattern. */
  recoveryMinAgreement: 0.85,
  /** Criterion 2: the mode must beat Off on the same degraded copy by at least this share. */
  recoveryMinGainOverOff: 0.05,
  /** Do no harm: on the undegraded photo, boundary agreement with Off. */
  wellExposedMinAgreement: 0.9,
  /** Criterion 3e: confetti ratio may rise at most this much over Off on the same noisy fixture. */
  maxConfettiRise: 0.02,
  /** Criterion 3f: distinct threads kept, as a share of Off's. */
  minDistinctThreadShare: 0.9,
  /** Criterion 3f: extra palette pairs closer than `nearDuplicateDistance` allowed over Off. */
  maxExtraNearDuplicatePairs: 1,
  nearDuplicateDistance: 0.03,
} as const;

const toLinear = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const toSrgb = (v: number) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.max(0, v) ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, c)) * 255);
};

/** −1 EV, contrast reduced to 40% around mid-grey, and a warm cast, all in linear light. */
function degrade(source: PixelBuffer): PixelBuffer {
  const cast = [1.1, 1, 0.85];
  const data = new Uint8ClampedArray(source.data.length);
  for (let o = 0; o < data.length; o += 4) {
    for (let c = 0; c < 3; c++) data[o + c] = toSrgb((0.09 + (toLinear(source.data[o + c]) * 0.5 - 0.09) * 0.4) * cast[c]);
    data[o + 3] = source.data[o + 3];
  }
  return { data, width: source.width, height: source.height };
}

const clamp = (v: number) => Math.max(0, Math.min(255, v));

const FIXTURES: Array<{ name: string; source: PixelBuffer }> = [
  { name: "photo", source: makePhotoLikeBuffer(360, 240, 30) },
  {
    name: "landscape",
    source: makeBuffer(360, 240, (x, y) => {
      const n = pseudoNoise(x, y, 35);
      const base: RGB = y < 130 ? [110 + x * 0.15, 150 + x * 0.1, 215] : [70 + x * 0.08, 110 - (y - 130) * 0.2, 50];
      return [clamp(base[0] + n), clamp(base[1] + n), clamp(base[2] + n)];
    }),
  },
  {
    name: "portrait",
    source: makeBuffer(300, 360, (x, y) => {
      const n = pseudoNoise(x, y, 18);
      const inFace = ((x - 150) / 90) ** 2 + ((y - 190) / 120) ** 2 < 1;
      const base: RGB = y < 90 && Math.abs(x - 150) < 110 ? [60, 45, 35] : inFace ? [205 - (y - 190) * 0.15, 160 - (y - 190) * 0.12, 130 - (y - 190) * 0.1] : [90, 100, 110];
      return [clamp(base[0] + n), clamp(base[1] + n), clamp(base[2] + n)];
    }),
  },
];

const PATTERN_OPTIONS = { longerSideStitches: 80, colorCount: 16 } as const;

function paletteOklab(pattern: StitchPattern): Oklab[] {
  return pattern.palette.map((c) => rgbToOklab(c.rgb));
}

/** Share of cells whose colour in `pattern` is within the agreement tolerance of their colour in `reference`. */
function cellAgreement(pattern: StitchPattern, reference: StitchPattern): number {
  const a = paletteOklab(pattern);
  const b = paletteOklab(reference);
  const tolerance = RELEASE_GATES.cellAgreementTolerance ** 2;
  let agree = 0;
  let total = 0;
  for (let i = 0; i < pattern.cellPalette.length; i++) {
    const p = pattern.cellPalette[i];
    const r = reference.cellPalette[i];
    if (p === EMPTY_CELL || r === EMPTY_CELL) continue;
    total++;
    if (oklabDistanceSquared(a[p], b[r]) < tolerance) agree++;
  }
  return total > 0 ? agree / total : 1;
}

/** Share of right/down neighbour pairs where both patterns agree on whether the two cells share a colour: region boundaries in the same places, whatever the colours. */
function boundaryAgreement(pattern: StitchPattern, reference: StitchPattern): number {
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

function nearDuplicatePairs(pattern: StitchPattern): number {
  const colors = paletteOklab(pattern);
  const limit = RELEASE_GATES.nearDuplicateDistance ** 2;
  let pairs = 0;
  for (let i = 0; i < colors.length; i++) for (let j = i + 1; j < colors.length; j++) if (oklabDistanceSquared(colors[i], colors[j]) < limit) pairs++;
  return pairs;
}

function confetti(pattern: StitchPattern, source: PixelBuffer): number {
  return computePatternDiagnostics(pattern, downsampleToGrid(source, pattern.width, pattern.height)).confettiRatio;
}

function operationsRun(source: PixelBuffer, mode: Mode) {
  const params = analyzeEnhancement(source, ENHANCEMENT_PRESETS[mode]);
  const identity = params.toneLut.every((v, i) => Math.abs(v - i / (params.toneLut.length - 1)) < 1e-4);
  return {
    whiteBalance: params.gains.some((g) => Math.abs(g - 1) > 1e-6),
    tone: !identity,
    clahe: params.clahe !== null,
    vibrance: params.vibranceAmount > 0,
  };
}

const report: Record<string, unknown> = { gates: RELEASE_GATES, released: releasedEnhancementModes() };

describe("enhancement release gates", () => {
  it.each(MODES)(
    "%s: recovery, do-no-harm, noise and thread-palette gates",
    (mode) => {
      const failures: string[] = [];
      const recoveryShortfalls: string[] = [];
      const metrics: Record<string, unknown> = {};

      for (const { name, source } of FIXTURES) {
        const degraded = degrade(source);
        const reference = buildPattern(source, PATTERN_OPTIONS);
        const offDegradedPattern = buildPattern(degraded, PATTERN_OPTIONS);
        const modeDegradedPattern = buildPattern(degraded, { ...PATTERN_OPTIONS, enhancementMode: mode });
        const modeOriginalPattern = buildPattern(source, { ...PATTERN_OPTIONS, enhancementMode: mode });
        const offOnDegraded = boundaryAgreement(offDegradedPattern, reference);
        const modeOnDegraded = boundaryAgreement(modeDegradedPattern, reference);
        const modeOnOriginal = boundaryAgreement(modeOriginalPattern, reference);
        metrics[`recovery.${name}`] = {
          offOnDegraded,
          modeOnDegraded,
          modeOnOriginal,
          colorAgreement: {
            offOnDegraded: cellAgreement(offDegradedPattern, reference),
            modeOnDegraded: cellAgreement(modeDegradedPattern, reference),
            modeOnOriginal: cellAgreement(modeOriginalPattern, reference),
          },
          operations: operationsRun(degraded, mode),
        };
        if (modeOnDegraded < RELEASE_GATES.recoveryMinAgreement) recoveryShortfalls.push(`${name}: recovery agreement ${modeOnDegraded.toFixed(3)}`);
        if (modeOnDegraded - offOnDegraded < RELEASE_GATES.recoveryMinGainOverOff) recoveryShortfalls.push(`${name}: gain over Off ${(modeOnDegraded - offOnDegraded).toFixed(3)}`);
        if (modeOnOriginal < RELEASE_GATES.wellExposedMinAgreement) failures.push(`${name}: do-no-harm agreement ${modeOnOriginal.toFixed(3)}`);
      }

      const noisy = makeBuffer(480, 320, (x, y) => {
        const n = pseudoNoise(x, y, 50);
        const base: RGB = x < 240 ? [200, 150, 100] : [80, 120, 90];
        return [clamp(base[0] + n), clamp(base[1] + n), clamp(base[2] + n)];
      });
      for (const edgeMode of ["standard", "crisp"] as const) {
        const off = confetti(buildPattern(noisy, { longerSideStitches: 120, colorCount: 8, edgeMode }), noisy);
        const on = confetti(buildPattern(noisy, { longerSideStitches: 120, colorCount: 8, edgeMode, enhancementMode: mode }), noisy);
        metrics[`noise.${edgeMode}`] = { off, on, operations: operationsRun(noisy, mode) };
        if (on - off > RELEASE_GATES.maxConfettiRise) failures.push(`noise ${edgeMode}: confetti rise ${(on - off).toFixed(4)}`);
      }

      const photo = degrade(FIXTURES[0].source);
      for (const paletteMode of ["dmc", "cosmo", "anchor"] as const) {
        const off = buildPattern(photo, { ...PATTERN_OPTIONS, paletteMode });
        const on = buildPattern(photo, { ...PATTERN_OPTIONS, paletteMode, enhancementMode: mode });
        const distinctShare = on.palette.length / off.palette.length;
        const extraPairs = nearDuplicatePairs(on) - nearDuplicatePairs(off);
        metrics[`threads.${paletteMode}`] = { offThreads: off.palette.length, onThreads: on.palette.length, distinctShare, extraPairs };
        if (distinctShare < RELEASE_GATES.minDistinctThreadShare) failures.push(`${paletteMode}: distinct thread share ${distinctShare.toFixed(3)}`);
        if (extraPairs > RELEASE_GATES.maxExtraNearDuplicatePairs) failures.push(`${paletteMode}: ${extraPairs} extra near-duplicate pairs`);
      }

      report[mode] = { metrics, failures, recoveryShortfalls, passesSafetyGates: failures.length === 0 };
      if (process.env.ENHANCEMENT_CALIBRATION_REPORT) writeFileSync(process.env.ENHANCEMENT_CALIBRATION_REPORT, JSON.stringify(report, null, 2));
      expect(failures).toEqual([]);
    },
    300_000
  );
});

